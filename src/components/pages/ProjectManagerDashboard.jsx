import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Users,
  Briefcase,
  AlertCircle,
  CheckCircle,
  Plus,
  MessageSquare,
  LogOut,
  Home,
  Menu,
  ChevronsLeft,
  ChevronsRight,
  Flag,
  BarChart3,
  TrendingUp,
  Zap,
  User,
  Loader2,
  RefreshCw,
  FileText,
  X
} from 'lucide-react';
import { collection, query, where, getDocs, getFirestore, doc, getDoc,onSnapshot, addDoc, serverTimestamp } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import ProjectTickets from './ProjectManagerTickets';
import TeamManagement from './TeamManagement';
import Ticketing from './Ticketing';
import * as XLSX from 'xlsx';
import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import TicketDetails from './TicketDetails';

// Animated count-up hook (same as ClientDashboard)
function useCountUp(target, duration = 1200) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    const startTime = performance.now();
    function easeOutCubic(t) {
      return 1 - Math.pow(1 - t, 3);
    }
    function animate(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const eased = easeOutCubic(progress);
      setCount(Math.round(eased * target));
      if (progress < 1) {
        requestAnimationFrame(animate);
      } else {
        setCount(target);
      }
    }
    requestAnimationFrame(animate);
  }, [target, duration]);
  return count;
}

// Utility to compute KPI metrics from ticket data (reuse from TeamManagement)
export function computeKPIsForTickets(tickets) {
  let totalResponse = 0, totalResolution = 0, count = 0;
  const details = tickets.map(ticket => {
    // Find created time
    const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
    // Find assignment time (first comment with 'Assigned to <name>' and authorRole 'user' or 'system')
    let assigned = null;
    let resolved = null;
    if (ticket.comments && Array.isArray(ticket.comments)) {
      for (const c of ticket.comments) {
        if (!assigned && c.message && c.message.toLowerCase().includes('assigned to') && c.authorRole && (c.authorRole === 'user' || c.authorRole === 'system')) {
          assigned = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp ? new Date(c.timestamp) : null);
        }
        if (!resolved && c.message && c.message.toLowerCase().includes('resolution updated') && c.authorRole && c.authorRole === 'resolver') {
          resolved = c.timestamp?.toDate ? c.timestamp.toDate() : (c.timestamp ? new Date(c.timestamp) : null);
        }
      }
    }
    // Fallback: if ticket.status is Resolved and lastUpdated exists
    if (!resolved && ticket.status === 'Resolved' && ticket.lastUpdated) {
      resolved = ticket.lastUpdated.toDate ? ticket.lastUpdated.toDate() : new Date(ticket.lastUpdated);
    }
    // Only count if assigned
    if (ticket.assignedTo && ticket.assignedTo.email) {
      count++;
      let responseTime = assigned && created ? (assigned - created) : null;
      let resolutionTime = resolved && assigned ? (resolved - assigned) : null;
      if (responseTime) totalResponse += responseTime;
      if (resolutionTime) totalResolution += resolutionTime;
      return {
        ticketNumber: ticket.ticketNumber,
        subject: ticket.subject,
        assignee: ticket.assignedTo?.email,
        responseTime,
        resolutionTime,
        status: ticket.status,
        created,
        assigned,
        resolved
      };
    }
    return null;
  }).filter(Boolean);
  return {
    count,
    avgResponse: count ? totalResponse / count : 0,
    avgResolution: count ? totalResolution / count : 0,
    details
  };
}

// Utility to convert KPI data to CSV and trigger download
async function downloadKpiCsv(kpiData, projectName = '') {
  if (!kpiData || !kpiData.details) return;
  // Chart data summary rows
  const chartHeader = ['Ticket #', 'Response Time (min)', 'Resolution Time (min)'];
  const chartRows = kpiData.details.map(row => [
    row.ticketNumber,
    row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
    row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : ''
  ]);
  // Table data
  const header = ['Ticket #','Subject','Assignee','Response Time (min)','Resolution Time (min)','Status'];
  const rows = kpiData.details.map(row => [
    row.ticketNumber,
    row.subject,
    row.assignee,
    row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
    row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : '',
    row.status
  ]);
  // Compose CSV
  const csvContent = [
    ['KPI Bar Chart Data:'],
    chartHeader,
    ...chartRows,
    [],
    ['KPI Table Data:'],
    header,
    ...rows
  ].map(r => r.map(x => '"'+String(x).replace(/"/g,'""')+'"').join(',')).join('\n');

  // Save KPI report to Firestore
  try {
    const db = getFirestore();
    const auth = getAuth();
    const user = auth.currentUser;
    const reportDoc = {
      createdAt: serverTimestamp(),
      createdBy: user ? { uid: user.uid, email: user.email } : null,
      project: projectName || '',
      summary: {
        totalTickets: kpiData.count,
        avgResponse: kpiData.avgResponse,
        avgResolution: kpiData.avgResolution
      },
      chartData: chartRows,
      tableData: rows
    };
    await addDoc(collection(db, 'kpi_reports'), reportDoc);
  } catch (e) {
    // Optionally show error to user
    console.error('Failed to save KPI report to Firestore:', e);
  }

  // Download CSV
  const blob = new Blob([csvContent], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `KPI_Report_Project.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// Helper to convert SVG chart to PNG data URL
async function getChartPngDataUrl(chartId) {
  const chartElem = document.getElementById(chartId);
  if (!chartElem) return null;
  const svg = chartElem.querySelector('svg');
  if (!svg) return null;
  const svgData = new XMLSerializer().serializeToString(svg);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const img = new window.Image();
  img.src = 'data:image/svg+xml;base64,' + window.btoa(svgData);
  await new Promise(res => { img.onload = res; });
  canvas.width = img.width;
  canvas.height = img.height;
  ctx.drawImage(img, 0, 0);
  return canvas.toDataURL('image/png');
}

export async function exportKpiToExcelWithChartImage(kpiData, chartId, projectName = '') {
  if (!kpiData || !kpiData.details) return;

  // 1. Create workbook and worksheet
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet('KPI Report');

  // 2. Add table data
  worksheet.addRow(['Ticket #','Subject','Assignee','Response Time (min)','Resolution Time (min)','Status']);
  kpiData.details.forEach(row => {
    worksheet.addRow([
      row.ticketNumber,
      row.subject,
      row.assignee,
      row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
      row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : '',
      row.status
    ]);
  });

  // 3. Add chart image
  const imgDataUrl = await getChartPngDataUrl(chartId);
  if (imgDataUrl) {
    const imageId = workbook.addImage({
      base64: imgDataUrl,
      extension: 'png',
    });
    // Place the image at the top of the worksheet
    worksheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 500, height: 300 }
    });
  }

  // 4. Download the Excel file
  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer]), `KPI_Report_${projectName || 'Project'}.xlsx`);

  // 5. Save KPI report to Firestore
  try {
    const db = getFirestore();
    const auth = getAuth();
    const user = auth.currentUser;
    const chartData = kpiData.details.map(row => ({
      ticketNumber: row.ticketNumber,
      responseTime: row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
      resolutionTime: row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : ''
    }));
    const tableData = kpiData.details.map(row => ({
      ticketNumber: row.ticketNumber,
      subject: row.subject,
      assignee: row.assignee,
      responseTime: row.responseTime ? (row.responseTime/1000/60).toFixed(2) : '',
      resolutionTime: row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) : '',
      status: row.status
    }));
    const reportDoc = {
      createdAt: serverTimestamp(),
      createdBy: user ? { uid: user.uid, email: user.email } : null,
      project: projectName || '',
      summary: {
        totalTickets: kpiData.count,
        avgResponse: kpiData.avgResponse,
        avgResolution: kpiData.avgResolution
      },
      chartData,
      tableData
    };
    await addDoc(collection(db, 'kpi_reports'), reportDoc);
  } catch (e) {
    console.error('Failed to save KPI report to Firestore:', e);
  }
}

const ProjectManagerDashboard = () => {
  const navigate = useNavigate();
  const [projects, setProjects] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [managerName, setManagerName] = useState('');
  const [stats, setStats] = useState({
   
    activeTickets: 0,
    teamMembers: 0,
    completedTickets: 0
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [searchParams] = useSearchParams();
  const auth = getAuth();
  const db = getFirestore();
  const [roleChangeToast, setRoleChangeToast] = useState({ show: false, message: '' });
  const [showMobilePopup, setShowMobilePopup] = useState(false);
  const [showSwitchProjectModal, setShowSwitchProjectModal] = useState(false);
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  // Animated counts for priorities
  const highCount = useCountUp(tickets.filter(t => t.priority === 'High').length);
  const mediumCount = useCountUp(tickets.filter(t => t.priority === 'Medium').length);
  const lowCount = useCountUp(tickets.filter(t => t.priority === 'Low').length);

  // Add state to track if a ticket is being viewed in detail
  const [viewingTicket, setViewingTicket] = useState(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
      if (!firebaseUser) {
        navigate('/login');
      }
    });
    return () => unsubscribe();
  }, [auth, navigate]);
 // Handle URL parameters for tab navigation
 useEffect(() => {
  const tabParam = searchParams.get('tab');
  if (tabParam && ['dashboard', 'tickets', 'create'].includes(tabParam)) {
    setActiveTab(tabParam);
  }
}, [searchParams]);
  useEffect(() => {
    if (!authChecked || !user) return;
    setLoading(true);
    let unsubscribe;
    // Real-time listener for projects
    const projectsQuery = query(collection(db, 'projects'));
    unsubscribe = onSnapshot(projectsQuery, (projectsSnapshot) => {
        const projectsData = projectsSnapshot.docs
          .map(doc => ({ id: doc.id, ...doc.data() }))
          .filter(project =>
            (project.members || []).some(
              m => m.email === user.email && m.role === 'project_manager'
            )
          );
        setProjects(projectsData);
        // Set default selected project
        if (projectsData.length > 0 && !selectedProjectId) {
          setSelectedProjectId(projectsData[0].id);
        }
        setLoading(false);
    }, (error) => {
      console.error('Error fetching projects:', error);
        setLoading(false);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [authChecked, user, db]);

  // Add a real-time listener for role changes
  useEffect(() => {
    let unsubscribe;
    if (auth.currentUser) {
      const userDocRef = doc(db, 'users', auth.currentUser.uid);
      unsubscribe = onSnapshot(userDocRef, (userDoc) => {
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          if (role === 'employee') {
            setRoleChangeToast({ show: true, message: 'Your role has changed. Redirecting...' });
            setTimeout(() => navigate('/employeedashboard'), 2000);
          } else if (role === 'admin') {
            setRoleChangeToast({ show: true, message: 'Your role has changed. Redirecting...' });
            setTimeout(() => navigate('/admin'), 2000);
          } else if (role === 'client') {
            setRoleChangeToast({ show: true, message: 'Your role has changed. Redirecting...' });
            setTimeout(() => navigate('/clientdashboard'), 2000);
          } else if (role !== 'project_manager') {
            setRoleChangeToast({ show: true, message: 'Your access has been removed. Signing out...' });
            setTimeout(() => { auth.signOut(); navigate('/login'); }, 2000);
          }
        } else {
          setRoleChangeToast({ show: true, message: 'Your access has been removed. Signing out...' });
          setTimeout(() => { auth.signOut(); navigate('/login'); }, 2000);
        }
      });
    }
    return () => { if (unsubscribe) unsubscribe(); };
  }, [auth, navigate]);

  const handleLogout = async () => {
    try {
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, active: activeTab === 'dashboard' },
    { id: 'tickets', label: 'Tickets', icon: MessageSquare, active: activeTab === 'tickets' },
    { id: 'team', label: 'Team', icon: Users, active: activeTab === 'team' },
    { id: 'kpi', label: 'KPI Reports', icon: BarChart3, active: activeTab === 'kpi' },
    { id: 'create', label: 'Create Ticket', icon: Plus, active: activeTab === 'create' }
  ];

  const renderSidebarItem = (item) => {
    const IconComponent = item.icon;
    return (
      <button
        key={item.id}
        onClick={item.onClick ? item.onClick : () => {
          setActiveTab(item.id);
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
          item.active
            ? 'bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] text-white shadow-lg'
            : 'text-gray-600 hover:bg-orange-100 hover:text-orange-700'
        }`}
        title={sidebarCollapsed ? item.label : ''}
      >
        <div className={`flex items-center ${sidebarCollapsed ? 'justify-center' : ''}`}>
          <IconComponent className={`w-5 h-5 ${item.active ? 'text-white' : 'text-gray-600'}`} />
        </div>
        {!sidebarCollapsed && <span>{item.label}</span>}
      </button>
    );
  };

  useEffect(() => {
    const checkMobile = () => {
      if (window.innerWidth < 768) {
        setShowMobilePopup(true);
      } else {
        setShowMobilePopup(false);
      }
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  const handleSwitchProject = (projectId) => {
    setSelectedProjectId(projectId);
    setShowSwitchProjectModal(false);
  };

  // Filter tickets for current user (assigned to or raised by)
  const currentUserEmail = user?.email;
  const myTickets = tickets.filter(t =>
    (t.assignedTo && t.assignedTo.email === currentUserEmail) ||
    t.email === currentUserEmail
  );

  // Add this after the useEffect that fetches projects
  useEffect(() => {
    if (!authChecked || !user || !selectedProjectId) return;
    setLoading(true);
    let unsubscribe;
    const ticketsCollectionRef = collection(db, 'tickets');
    let q;
    if (selectedProjectId === 'all' && projects.length > 0) {
      const projectIds = projects.map(p => p.id);
      // Firestore 'in' query limit is 10, so batch if needed
      // (implement batching if you expect >10 projects)
      q = query(ticketsCollectionRef, where('projectId', 'in', projectIds));
    } else {
      q = query(ticketsCollectionRef, where('projectId', '==', selectedProjectId));
    }
    unsubscribe = onSnapshot(q, (snapshot) => {
      const ticketsData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTickets(ticketsData);
      setLoading(false);
    }, (err) => {
      setTickets([]);
      setLoading(false);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [authChecked, user, db, selectedProjectId, projects]);

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-orange-600"></div>
      </div>
    );
  }

  return (
    <div className="relative">
      {showMobilePopup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-xl shadow-lg p-8 max-w-xs text-center">
            <h2 className="text-lg font-bold mb-4">Please use desktop for better use</h2>
            <p className="text-gray-600 mb-4">This dashboard is best experienced on a desktop device.</p>
            <button
              className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded font-semibold"
              onClick={() => setShowMobilePopup(false)}
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      {showLogoutConfirm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="bg-white rounded-lg shadow-lg p-8 max-w-xs w-full text-center">
            <h2 className="text-lg font-semibold mb-4">Confirm Logout</h2>
            <p className="mb-6 text-gray-700">Are you sure you want to log out?</p>
            <div className="flex justify-center gap-4">
              <button
                className="px-4 py-2 bg-gray-200 rounded hover:bg-gray-300"
                onClick={() => setShowLogoutConfirm(false)}
              >
                Cancel
              </button>
              <button
                className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
                onClick={() => {
                  setShowLogoutConfirm(false);
                  handleLogout();
                }}
              >
                Yes, Log Out
              </button>
            </div>
          </div>
        </div>
      )}
      <div className={showLogoutConfirm ? 'flex h-screen bg-gray-50 filter blur-sm pointer-events-none select-none' : 'flex h-screen bg-gray-50'}>
        <aside className={`fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out ${
          sidebarCollapsed ? 'w-20' : 'w-64'
        } bg-white shadow-xl lg:translate-x-0 lg:static ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}>
          <div className="flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              {!sidebarCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-xl flex items-center justify-center">
                    <Briefcase className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-l font-bold text-gray-900">Project Head</h1>
                    <p className="text-sm text-gray-500">Manager Portal</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 rounded-lg hover:bg-orange-100 transition-colors text-gray-600"
              >
                {sidebarCollapsed ? (
                  <ChevronsRight className="w-6 h-6" />
                ) : (
                  <ChevronsLeft className="w-6 h-6" />
                )}
              </button>
            </div>

            {/* Sidebar Navigation */}
            <nav className="flex-1 p-6 space-y-2">
              {sidebarItems.map(renderSidebarItem)}
            </nav>

            {/* Sidebar Footer */}
            <div className="p-6 border-t border-gray-200">
              {!sidebarCollapsed && (
                <div className="flex items-center space-x-3 mb-4">
                  <div className="w-8 h-8 bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{managerName.toUpperCase()}</p>
                    <p className="text-xs text-gray-500">Project Manager</p>
                  </div>
                </div>
              )}
              <button
                onClick={() => setShowLogoutConfirm(true)}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-start'} space-x-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200`}
              >
                <LogOut className="w-4 h-4" />
                {!sidebarCollapsed && <span className="text-sm font-medium">Sign Out</span>}
              </button>
            </div>
          </div>
        </aside>

        <div className="flex-1 flex flex-col overflow-hidden">
          <header className="bg-white shadow-sm border-b border-gray-200">
            <div className="flex items-center justify-between px-6 py-4">
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setSidebarOpen(true)}
                  className="lg:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                >
                  <Menu className="w-6 h-6 text-gray-600" />
                </button>
                <div>
                  {projects.length === 0 ? (
                    <h1 className="text-2xl font-bold text-gray-900">No Project Assigned</h1>
                  ) : projects.length === 1 ? (
                    <h1 className="text-2xl font-bold text-gray-900">Project: {projects[0].name}</h1>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <span className="text-2xl font-bold text-gray-900">Project:</span>
                      <select
                        className="text-2xl font-bold text-gray-900 bg-white border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-orange-400"
                        value={selectedProjectId}
                        onChange={e => setSelectedProjectId(e.target.value)}
                      >
                        {projects.map(project => (
                          <option key={project.id} value={project.id}>{project.name}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <p className="text-gray-600">Manage your assigned support tickets and communications</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={() => setShowLogoutConfirm(true)}
                  className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-orange-600 hover:bg-orange-50 rounded-lg transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </header>

          <main className="flex-1 overflow-auto p-6 sm:p-4 xs:p-2">
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mt-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">My Project Tickets</h2>
                  {selectedTicketId ? (
                    <TicketDetails ticketId={selectedTicketId} onBack={() => setSelectedTicketId(null)} />
                  ) : myTickets.length === 0 ? (
                    <div className="text-gray-500">You have no tickets assigned to you or raised by you in this project.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-xs text-left text-gray-700 border">
                        <thead>
                          <tr>
                            <th className="py-1 px-2">Ticket #</th>
                            <th className="py-1 px-2">Subject</th>
                            <th className="py-1 px-2">Status</th>
                            <th className="py-1 px-2">Priority</th>
                            <th className="py-1 px-2">Created</th>
                          </tr>
                        </thead>
                        <tbody>
                          {myTickets.map((ticket, idx) => (
                            <tr
                              key={idx}
                              className="border-t cursor-pointer hover:bg-orange-50"
                              onClick={() => setSelectedTicketId(ticket.id)}
                            >
                              <td className="py-1 px-2">{ticket.ticketNumber}</td>
                              <td className="py-1 px-2">{ticket.subject}</td>
                              <td className="py-1 px-2">{ticket.status}</td>
                              <td className="py-1 px-2">{ticket.priority}</td>
                              <td className="py-1 px-2">{ticket.created?.toDate ? ticket.created.toDate().toLocaleString() : (ticket.created ? new Date(ticket.created).toLocaleString() : '')}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-8 lg:grid-cols-2">
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2 text-orange-600" />
                      Ticket Status Trends
                    </h3>
                    <div className="h-64 bg-gray-50 rounded-lg p-4">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart
                          data={[
                            { name: 'Open', value: tickets.filter(t => t.status === 'Open').length },
                            { name: 'In Progress', value: tickets.filter(t => t.status === 'In Progress').length },
                            { name: 'Resolved', value: tickets.filter(t => t.status === 'Resolved').length },
                            { name: 'Closed', value: tickets.filter(t => t.status === 'Closed').length }
                          ]}
                          margin={{ top: 20, right: 30, left: 0, bottom: 0 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                          <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                          <YAxis allowDecimals={false} tick={{ fill: '#64748b', fontSize: 14 }} axisLine={false} tickLine={false} />
                          <Tooltip contentStyle={{ background: '#fff', borderRadius: 8, border: '1px solid #e5e7eb', color: '#334155' }} />
                          <Line type="monotone" dataKey="value" stroke="#2563eb" strokeWidth={3} dot={{ r: 6, fill: '#2563eb', stroke: '#fff', strokeWidth: 2 }} activeDot={{ r: 8 }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                      <BarChart3 className="w-5 h-5 mr-2 text-orange-600" />
                      Ticket Priority Distribution
                    </h3>
                    <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
                      <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center">
                        <Flag className="w-8 h-8 text-red-500 mb-2" />
                        <span className="text-2xl font-bold text-red-600">{highCount}</span>
                        <span className="text-sm font-medium text-red-700 mt-1">High Priority</span>
                      </div>
                      <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-xl p-6 flex flex-col items-center">
                        <Flag className="w-8 h-8 text-yellow-500 mb-2" />
                        <span className="text-2xl font-bold text-yellow-600">{mediumCount}</span>
                        <span className="text-sm font-medium text-yellow-700 mt-1">Medium Priority</span>
                      </div>
                      <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-6 flex flex-col items-center">
                        <Flag className="w-8 h-8 text-green-500 mb-2" />
                        <span className="text-2xl font-bold text-green-600">{lowCount}</span>
                        <span className="text-sm font-medium text-green-700 mt-1">Low Priority</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                    <Zap className="w-6 h-6 mr-3 text-orange-600" />
                    Quick Actions
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                   

                    <button
                      onClick={() => setActiveTab('tickets')}
                      className="group bg-white p-6 rounded-xl border border-gray-200 hover:border-orange-300 hover:shadow-md transition-all duration-300 text-left"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-orange-50 rounded-lg flex items-center justify-center group-hover:bg-orange-100 transition-colors">
                          <MessageSquare className="w-6 h-6 text-orange-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-gray-900 text-lg">View Tickets</p>
                          <p className="text-gray-600 text-sm">Manage support tickets</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>

                
              </div>
            )}

            {activeTab === 'team' && (
              <TeamManagement />
            )}

            {activeTab === 'tickets' && (
              <ProjectTickets
                setActiveTab={setActiveTab}
                selectedProjectId={selectedProjectId}
                selectedProjectName={projects.find(p => p.id === selectedProjectId)?.name || ''}
                allProjectIds={projects.map(p => p.id)}
                setViewingTicket={setViewingTicket}
              />
            )}

            {activeTab === 'create' && (
              <div className="max-w-auto mx-auto">
                <Ticketing 
                  onTicketCreated={() => setActiveTab('tickets')}
                  selectedProjectId={selectedProjectId}
                  selectedProjectName={projects.find(p => p.id === selectedProjectId)?.name || ''}
                />
              </div>
            )}

            {activeTab === 'kpi' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center"><BarChart3 className="w-6 h-6 mr-2 text-orange-600" />KPI Reports</h2>
                {tickets.length === 0 ? (
                  <div className="text-gray-500">No tickets found for KPI analysis.</div>
                ) : (
                  (() => {
                    const kpi = computeKPIsForTickets(tickets);
                    return (
                      <>
                        <div className="mb-4">
                          <div><b>Total Tickets Assigned:</b> {kpi.count}</div>
                          <div><b>Avg. Response Time:</b> {kpi.avgResponse ? (kpi.avgResponse/1000/60).toFixed(2) + ' min' : 'N/A'}</div>
                          <div><b>Avg. Resolution Time:</b> {kpi.avgResolution ? (kpi.avgResolution/1000/60).toFixed(2) + ' min' : 'N/A'}</div>
                        </div>
                        {/* KPI Bar Chart */}
                        <div className="bg-white rounded-lg p-4 mb-6 border border-gray-100 shadow-sm" id="kpi-bar-chart">
                          <h3 className="text-lg font-semibold mb-2">KPI Bar Chart</h3>
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={kpi.details.map(row => ({
                              name: row.ticketNumber,
                              'Response Time (min)': row.responseTime ? (row.responseTime/1000/60) : 0,
                              'Resolution Time (min)': row.resolutionTime ? (row.resolutionTime/1000/60) : 0,
                            }))}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="name" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="Response Time (min)" fill="#8884d8" />
                              <Bar dataKey="Resolution Time (min)" fill="#82ca9d" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex gap-4 mb-4">
                          {/* <button
                            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold"
                            onClick={() => downloadKpiCsv(kpi, projects.find(p => p.id === selectedProjectId)?.name || '')}
                          >
                            Download CSV
                          </button> */}
                          <button
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold"
                            onClick={() => exportKpiToExcelWithChartImage(kpi, 'kpi-bar-chart', projects.find(p => p.id === selectedProjectId)?.name || '')}
                          >
                            Export to Excel
                          </button>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-xs text-left text-gray-700 border">
                            <thead>
                              <tr>
                                <th className="py-1 px-2">Ticket #</th>
                                <th className="py-1 px-2">Subject</th>
                                <th className="py-1 px-2">Assignee</th>
                                <th className="py-1 px-2">Response Time</th>
                                <th className="py-1 px-2">Resolution Time</th>
                                <th className="py-1 px-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {kpi.details.map((row, idx) => (
                                <tr key={idx} className="border-t">
                                  <td className="py-1 px-2">{row.ticketNumber}</td>
                                  <td className="py-1 px-2">{row.subject}</td>
                                  <td className="py-1 px-2">{row.assignee}</td>
                                  <td className="py-1 px-2">{row.responseTime ? (row.responseTime/1000/60).toFixed(2) + ' min' : 'N/A'}</td>
                                  <td className="py-1 px-2">{row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) + ' min' : 'N/A'}</td>
                                  <td className="py-1 px-2">{row.status}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </>
                    );
                  })()
                )}
              </div>
            )}
          </main>
        </div>
        {/* Add toast UI */}
        {roleChangeToast.show && (
          <div className="fixed top-6 left-1/2 transform -translate-x-1/2 p-4 rounded-xl shadow-lg z-[9999] bg-orange-600 text-white font-semibold">
            {roleChangeToast.message}
          </div>
        )}
        {/* Switch Project Modal */}
        {showSwitchProjectModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-40">
            <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full relative">
              <button
                className="absolute top-2 right-2 text-gray-400 hover:text-red-500"
                onClick={() => setShowSwitchProjectModal(false)}
              >
                <X className="w-6 h-6" />
              </button>
              <h2 className="text-xl font-bold mb-4">Switch Project</h2>
              <ul className="space-y-2">
                {projects.map(project => (
                  <li key={project.id}>
                    <button
                      className={`w-full text-left px-4 py-2 rounded-lg transition-colors ${selectedProjectId === project.id ? 'bg-orange-100 text-orange-700 font-semibold' : 'hover:bg-gray-100'}`}
                      onClick={() => handleSwitchProject(project.id)}
                    >
                      {project.name}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ProjectManagerDashboard; 