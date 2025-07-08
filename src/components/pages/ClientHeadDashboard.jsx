import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import ClientHeadTickets from './ClientHeadTickets';
import Ticketing from './Ticketing';
import {
  Users,
  Building,
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
  Briefcase,
  Activity,
  Clock,
  Loader2,
  RefreshCw,
  FileText,
  ChevronRight,
  Calendar,
  XCircle
} from 'lucide-react';
import { collection, query, where, getDocs, getFirestore, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import LogoutModal from './LogoutModal';
import TicketDetails from './TicketDetails';
import { computeKPIsForTickets, exportKpiToExcelWithChartImage, SLA_RULES } from './ProjectManagerDashboard';
import * as XLSX from 'xlsx';

// Animated count-up hook
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

const getStatusIcon = (status) => {
  switch (status) {
    case 'Open': return <AlertCircle className="w-4 h-4 text-blue-500" />;
    case 'In Progress': return <Clock className="w-4 h-4 text-amber-500" />;
    case 'Resolved': return <CheckCircle className="w-4 h-4 text-emerald-500" />;
    case 'Closed': return <XCircle className="w-4 h-4 text-gray-500" />;
    default: return null;
  }
};

const getStatusBadge = (status) => {
  const baseClasses = "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium";
  switch (status) {
    case 'Open':
      return `${baseClasses} bg-blue-100 text-blue-800`;
    case 'In Progress':
      return `${baseClasses} bg-amber-100 text-amber-800`;
    case 'Resolved':
      return `${baseClasses} bg-emerald-100 text-emerald-800`;
    case 'Closed':
      return `${baseClasses} bg-gray-100 text-gray-800`;
    default:
      return `${baseClasses} bg-gray-100 text-gray-800`;
  }
};

const ClientHeadDashboard = () => {
  const navigate = useNavigate();
  const [clients, setClients] = useState([]);
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [clientHeadName, setClientHeadName] = useState('');
  const [stats, setStats] = useState({
   
    pendingTickets: 0,
    resolvedTickets: 0
  });
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [searchParams] = useSearchParams();
  const auth = getAuth();
  const db = getFirestore();
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);

  // Animated counts for priorities
  const highCount = useCountUp(tickets.filter(t => t.priority === 'High').length);
  const mediumCount = useCountUp(tickets.filter(t => t.priority === 'Medium').length);
  const lowCount = useCountUp(tickets.filter(t => t.priority === 'Low').length);

  // KPI filter state
  const [kpiFromDate, setKpiFromDate] = useState('');
  const [kpiToDate, setKpiToDate] = useState('');
  const [kpiPeriod, setKpiPeriod] = useState('custom');
  const [appliedKpiFromDate, setAppliedKpiFromDate] = useState('');
  const [appliedKpiToDate, setAppliedKpiToDate] = useState('');
  const [appliedKpiPeriod, setAppliedKpiPeriod] = useState('custom');

  // Add state for filter UI
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [period, setPeriod] = useState('custom');
  const [appliedFromDate, setAppliedFromDate] = useState('');
  const [appliedToDate, setAppliedToDate] = useState('');
  const [appliedPeriod, setAppliedPeriod] = useState('custom');

  // Add state for selected KPI month
  const [kpiSelectedMonth, setKpiSelectedMonth] = useState(() => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,'0')}`;
  });

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
    if (tabParam && ['dashboard', 'tickets', 'create', 'clients'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);
  useEffect(() => {
    if (!authChecked || !user) return;
    setIsLoading(true);
    setError(null);
    let unsubscribe;
    // Real-time listener for projects
    const projectsQuery = query(collection(db, 'projects'));
    unsubscribe = onSnapshot(projectsQuery, (projectsSnapshot) => {
      const projectsData = projectsSnapshot.docs
        .map(doc => ({ id: doc.id, ...doc.data() }))
        .filter(project =>
          (project.members || []).some(
            m => m.email === user.email && (m.role === 'client_head' || m.role === 'client')
          )
        );
      setProjects(projectsData);
      if (projectsData.length > 0 && !selectedProjectId) {
        setSelectedProjectId(projectsData[0].id);
      }
      setIsLoading(false);
    }, (error) => {
      setError('Failed to load projects.');
      setIsLoading(false);
    });
    return () => { if (unsubscribe) unsubscribe(); };
  }, [authChecked, user, db]);

  useEffect(() => {
    if (!authChecked || !user || !selectedProjectId || !projects.length) return;
    setIsLoading(true);
    setError(null);
    let unsubscribe1, unsubscribe2;
    // Use project name for ticket queries
    const selectedProjectName = projects.find(p => p.id === selectedProjectId)?.name || '';
    if (!selectedProjectName) {
      setTickets([]);
      setIsLoading(false);
      return;
    }
    const ticketsCollectionRef = collection(db, 'tickets');
    const q1 = query(ticketsCollectionRef, where('project', '==', selectedProjectName));
    const q2 = query(ticketsCollectionRef, where('project', 'array-contains', selectedProjectName));
    let ticketsMap = {};
    unsubscribe1 = onSnapshot(q1, (snapshot) => {
      snapshot.docs.forEach(doc => {
        ticketsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setTickets(Object.values(ticketsMap));
      setIsLoading(false);
    }, (error) => {
      setError('Failed to load tickets.');
      setIsLoading(false);
    });
    unsubscribe2 = onSnapshot(q2, (snapshot) => {
      snapshot.docs.forEach(doc => {
        ticketsMap[doc.id] = { id: doc.id, ...doc.data() };
      });
      setTickets(Object.values(ticketsMap));
      setIsLoading(false);
    }, (error) => {
      setError('Failed to load tickets.');
      setIsLoading(false);
    });
    return () => {
      if (unsubscribe1) unsubscribe1();
      if (unsubscribe2) unsubscribe2();
    };
  }, [authChecked, user, db, selectedProjectId, projects]);

  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        if (!user) return;
        // Get client head's name
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        let clientHeadProject = null;
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          let displayName = '';
          if (userData.firstName && userData.lastName) {
            displayName = `${userData.firstName} ${userData.lastName}`;
          } else if (userData.firstName) {
            displayName = userData.firstName;
          } else if (userData.lastName) {
            displayName = userData.lastName;
          } else {
            displayName = userData.email.split('@')[0];
          }
          setClientHeadName(displayName);
          clientHeadProject = userData.project || null;
        }
        // Fetch clients
        const clientsQuery = query(
          collection(db, 'users'),
          where('role', '==', 'client')
        );
        const clientsSnapshot = await getDocs(clientsQuery);
        const clientsData = clientsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setClients(clientsData);
        // Update stats
        setStats({
          totalClients: clientsData.length,
          activeProjects: projects.filter(project => project.status === 'active').length,
          pendingTickets: tickets.filter(ticket => ticket.status === 'Open').length,
          resolvedTickets: tickets.filter(ticket => ticket.status === 'Closed').length
        });
        setLoading(false);
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
        setLoading(false);
      }
    };
    if (authChecked && user) {
      setLoading(true);
      fetchDashboardData();
    }
  }, [authChecked, user, db]);

  const handleLogout = async () => {
    setSigningOut(true);
    try {
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    } finally {
      setSigningOut(false);
      setShowLogoutModal(false);
    }
  };

  const handleLogoutClick = () => setShowLogoutModal(true);
  const handleLogoutCancel = () => setShowLogoutModal(false);

  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, active: activeTab === 'dashboard' },
    { id: 'team', label: 'Team', icon: Users, active: activeTab === 'team' },
    { id: 'tickets', label: 'Tickets', icon: MessageSquare, active: activeTab === 'tickets' },
    { id: 'kpi', label: 'KPI Reports', icon: BarChart3, active: activeTab === 'kpi' },
    { id: 'create', label: 'Create Ticket', icon: Plus, active: activeTab === 'create' },
  ];

  const renderSidebarItem = (item) => {
    const IconComponent = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => {
          setActiveTab(item.id);
          setSidebarOpen(false);
        }}
        className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'space-x-3'} px-4 py-3 rounded-xl transition-all duration-200 font-medium ${
          item.active
            ? 'bg-gradient-to-r from-blue-600 to-blue-700 text-white shadow-lg'
            : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
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

  const handleKpiFilterApply = () => {
    setAppliedKpiFromDate(kpiFromDate);
    setAppliedKpiToDate(kpiToDate);
    setAppliedKpiPeriod(kpiPeriod);
  };

  const handleKpiFilterReset = () => {
    setKpiFromDate('');
    setKpiToDate('');
    setKpiPeriod('custom');
    setAppliedKpiFromDate('');
    setAppliedKpiToDate('');
    setAppliedKpiPeriod('custom');
  };

  // Filter bar handlers
  const handleFilterApply = () => {
    setAppliedFromDate(fromDate);
    setAppliedToDate(toDate);
    setAppliedPeriod(period);
  };
  const handleFilterReset = () => {
    setFromDate('');
    setToDate('');
    setPeriod('custom');
    setAppliedFromDate('');
    setAppliedToDate('');
    setAppliedPeriod('custom');
  };

  function getField(ticket, ...keys) {
    for (const key of keys) {
      if (ticket[key]) return ticket[key];
    }
    return '';
  }

  function downloadTicketsAsExcel(tickets) {
    if (!tickets || tickets.length === 0) return;
    // Define the desired columns and their mapping
    const columns = [
      { header: 'Ticket ID', keys: ['ticketNumber', 'id'] },
      { header: 'Subject', keys: ['subject'] },
      { header: 'Module', keys: ['module', 'Module'] },
      { header: 'Type of Issue', keys: ['typeOfIssue', 'type_of_issue', 'type', 'Type of Issue'] },
      { header: 'Category', keys: ['category', 'Category'] },
      { header: 'Sub-Category', keys: ['subCategory', 'sub_category', 'sub-category', 'Sub-Category'] },
      { header: 'Status', keys: ['status', 'Status'] },
      { header: 'Priority', keys: ['priority', 'Priority'] },
      { header: 'Assigned To', keys: ['assignedTo', 'assigned_to', 'Assigned To'] },
      { header: 'Created By', keys: ['customer', 'createdBy', 'Created By', 'email'] },
      { header: 'Reported By', keys: ['reportedBy', 'Reported By'] },
    ];
    // Build rows
    const rows = tickets.map(ticket =>
      columns.map(col => {
        if (col.header === 'Assigned To') {
          const at = ticket.assignedTo;
          if (typeof at === 'object' && at) return at.name || at.email || '';
          return at || '';
        }
        if (col.header === 'Created By') {
          return getField(ticket, ...col.keys);
        }
        return getField(ticket, ...col.keys);
      })
    );
    // Add header
    rows.unshift(columns.map(col => col.header));
    // Create worksheet and workbook
    const ws = XLSX.utils.aoa_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Tickets');
    XLSX.writeFile(wb, 'tickets_export.xlsx');
  }

  if (!authChecked || loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // Find the project where the client head is a member
  const myProject = projects.find(project => (project.members || []).some(m => m.email === user?.email && m.role === 'client_head'));

  // Filter tickets for current user (assigned to or raised by)
  const currentUserEmail = user?.email;
  // Get all client and employee emails for the current project
  const clientAndEmployeeEmails = (myProject?.members || [])
    .filter(m => m.role === 'client' || m.userType === 'client' || m.role === 'employee' || m.userType === 'employee')
    .map(m => m.email);

  // Filter tickets assigned to the client head or raised by any client or employee in the project
  let myTickets = tickets.filter(t =>
    (t.assignedTo && t.assignedTo.email === currentUserEmail) ||
    (t.email && clientAndEmployeeEmails.includes(t.email))
  );
  // Only show unresolved tickets (case-insensitive, trim whitespace)
  myTickets = myTickets.filter(t => String(t.status).trim().toLowerCase() !== 'resolved');

  // Filter myTickets based on appliedFromDate, appliedToDate, appliedPeriod
  let filteredMyTickets = myTickets;
  if (appliedPeriod === 'week') {
    const now = new Date();
    const startOfWeek = new Date(now);
    startOfWeek.setDate(now.getDate() - now.getDay());
    startOfWeek.setHours(0,0,0,0);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= startOfWeek && created <= now;
    });
  } else if (appliedPeriod === 'month') {
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= startOfMonth && created <= now;
    });
  } else if (appliedPeriod === 'last2days') {
    const now = new Date();
    const twoDaysAgo = new Date(now);
    twoDaysAgo.setDate(now.getDate() - 2);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= twoDaysAgo && created <= now;
    });
  } else if (appliedFromDate && appliedToDate) {
    const from = new Date(appliedFromDate);
    const to = new Date(appliedToDate);
    to.setHours(23,59,59,999);
    filteredMyTickets = myTickets.filter(t => {
      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
      return created && created >= from && created <= to;
    });
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* LogoutModal always rendered above, not blurred */}
      <LogoutModal open={showLogoutModal} onCancel={handleLogoutCancel} onConfirm={handleLogout} loading={signingOut} />
      {/* Blurred content (sidebar + main) */}
      <div className={showLogoutModal ? 'flex flex-1 filter blur-sm pointer-events-none select-none' : 'flex flex-1'}>
        {/* Sidebar */}
        <aside className={`fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out ${sidebarCollapsed ? 'w-20' : 'w-64'} bg-white shadow-xl lg:translate-x-0 lg:static ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
          <div className="flex flex-col h-full">
            {/* Sidebar Header */}
            <div className="p-6 border-b border-gray-200 flex items-center justify-between">
              {!sidebarCollapsed && (
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
                    <Building className="w-6 h-6 text-white" />
                  </div>
                  <div>
                    <h1 className="text-l font-bold text-gray-900">Client Manager</h1>
                  </div>
                </div>
              )}
              <button
                onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
                className="p-2 rounded-lg hover:bg-gray-100 transition-colors text-gray-600"
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
                  <div className="w-8 h-8 bg-gradient-to-r from-blue-600 to-blue-700 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-white" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900">{clientHeadName.toUpperCase()}</p>
                    <p className="text-xs text-gray-500">Client Manager</p>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogoutClick}
                className={`w-full flex items-center ${sidebarCollapsed ? 'justify-center' : 'justify-start'} space-x-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200`}
              >
                <LogOut className="w-4 h-4" />
                {!sidebarCollapsed && <span className="text-sm font-medium">Sign Out</span>}
              </button>
            </div>
          </div>
        </aside>
        {/* Main Content */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Header */}
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
                  <h1 className="text-2xl font-bold text-gray-900">{myProject?.name || 'General'}</h1>
                  <p className="text-gray-600">Monitor client activities and project progress</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                <button
                  onClick={handleLogoutClick}
                  className="flex items-center space-x-2 px-4 py-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-all duration-200"
                >
                  <LogOut className="w-4 h-4" />
                  <span className="font-medium">Sign Out</span>
                </button>
              </div>
            </div>
          </header>
          {/* Dashboard Content */}
          <main className="flex-1 overflow-auto p-6 bg-gray-50">
            {activeTab === 'dashboard' && (
              <div className="space-y-8">
                {/* Stats Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                      // Pass filter data to ClientHeadTickets component
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'All',
                        priority: 'All',
                        raisedBy: 'all'
                      }));
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Total Tickets</p>
                        <p className="text-3xl font-bold text-gray-900">{tickets.length}</p>
                        <p className="text-xs text-gray-500 mt-1">All project tickets</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <FileText className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Tickets</p>
                        <p className="text-3xl font-bold text-gray-900">{tickets.filter(t => t.email === user?.email).length}</p>
                        <p className="text-xs text-gray-500 mt-1">My tickets</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Open Tickets</p>
                        <p className="text-3xl font-bold text-gray-900">{tickets.filter(t => t.status === 'Open').length}</p>
                        <p className="text-xs text-gray-500 mt-1">Needs attention</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <AlertCircle className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">In Progress</p>
                        <p className="text-3xl font-bold text-gray-900">{tickets.filter(t => t.status === 'In Progress').length}</p>
                        <p className="text-xs text-gray-500 mt-1">Being worked on</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <Clock className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Resolved</p>
                        <p className="text-3xl font-bold text-gray-900">{tickets.filter(t => t.status === 'Resolved').length}</p>
                        <p className="text-xs text-gray-500 mt-1">Completed</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <CheckCircle className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                </div>

                {/* My Project Tickets Table */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mt-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">My Tickets</h2>
                  <div className="flex flex-wrap gap-4 mb-4 items-end">
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">From Date</label>
                      <input type="date" className="border rounded px-2 py-1 text-sm" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">To Date</label>
                      <input type="date" className="border rounded px-2 py-1 text-sm" value={toDate} onChange={e => setToDate(e.target.value)} />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-600 mb-1">Period</label>
                      <select className="border rounded px-2 py-1 text-sm" value={period} onChange={e => setPeriod(e.target.value)}>
                        <option value="custom">Custom</option>
                        <option value="week">This Week</option>
                        <option value="month">This Month</option>
                        <option value="last2days">Last 2 Days</option>
                      </select>
                    </div>
                    <button className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold" onClick={() => downloadTicketsAsExcel(filteredMyTickets)}>Download</button>
                    <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold" onClick={handleFilterApply}>Apply</button>
                    <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded font-semibold" onClick={handleFilterReset}>Reset</button>
                  </div>
                  {selectedTicketId ? (
                    <TicketDetails ticketId={selectedTicketId} onBack={() => setSelectedTicketId(null)} />
                  ) : filteredMyTickets.length === 0 ? (
                    <div className="text-gray-500">You have no tickets assigned to you or raised by you in this project.</div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Ticket ID</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Subject</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Priority</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Raised By</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned To</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Assigned By</th>
                            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                          </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                          {computeKPIsForTickets(myTickets).details.map((row, idx) => (
                            <tr
                              key={idx}
                              onClick={() => setSelectedTicketId(row.ticketNumber)}
                              className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                            >
                              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{row.ticketNumber}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.subject}</td>
                              <td className="px-6 py-4 whitespace-nowrap">
                                <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                                  row.status === 'Open' ? 'bg-blue-100 text-blue-800' :
                                  row.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                                  row.status === 'Resolved' ? 'bg-green-100 text-green-800' :
                                  'bg-gray-100 text-gray-800'
                                }`}>
                                  {row.status}
                                </span>
                              </td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.priority}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.customer}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.assignedTo ? (row.assignedTo.name || row.assignedTo.email) : '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.assignedBy || '-'}</td>
                              <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{row.lastUpdated ? (row.lastUpdated.toDate ? row.lastUpdated.toDate().toLocaleString() : new Date(row.lastUpdated).toLocaleString()) : ''}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Charts and Analytics Section */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Status Distribution Line Chart */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                      <TrendingUp className="w-5 h-5 mr-2 text-blue-600" />
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

                  {/* Priority Distribution */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                      <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
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

                {/* Quick Actions */}
                <div className="bg-white p-8 rounded-xl shadow-sm border border-gray-100">
                  <h2 className="text-xl font-semibold text-gray-900 mb-6 flex items-center">
                    <Zap className="w-6 h-6 mr-3 text-blue-600" />
                    Quick Actions
                  </h2>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <button
                      onClick={() => setActiveTab('create')}
                      className="group bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-300 text-left"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                          <Plus className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-gray-900 text-lg">Create New Ticket</p>
                          <p className="text-gray-600 text-sm">Submit a new support request</p>
                        </div>
                      </div>
                    </button>
                    <button
                      onClick={() => setActiveTab('tickets')}
                      className="group bg-white p-6 rounded-xl border border-gray-200 hover:border-blue-300 hover:shadow-md transition-all duration-300 text-left"
                    >
                      <div className="flex items-center space-x-4">
                        <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                          <MessageSquare className="w-6 h-6 text-blue-600" />
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

            {/* Other tabs content */}
            {activeTab === 'team' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Clients</h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">
                  {(myProject?.members?.filter(m => m.userType === 'client') || []).map(member => (
                    <div key={member.uid} className="bg-purple-50 rounded-xl p-6 flex flex-col items-center shadow hover:shadow-lg transition">
                      <div className="w-16 h-16 bg-purple-200 rounded-full flex items-center justify-center mb-4">
                        <User className="w-8 h-8 text-purple-600" />
                      </div>
                      <div className="text-center">
                        <p className="text-lg font-semibold text-gray-900">{member.email}</p>
                        <p className="text-sm text-gray-600 capitalize">{member.role.replace('_', ' ')}</p>
                      </div>
                    </div>
                  ))}
                  {((myProject?.members?.filter(m => m.userType === 'client') || []).length === 0) && (
                    <div className="col-span-full text-center text-gray-500">No clients found for this project.</div>
                  )}
                </div>
              </div>
            )}

            {activeTab === 'clients' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4">Clients Management</h2>
                {/* Clients management content */}
              </div>
            )}

            {activeTab === 'tickets' && (
              <ClientHeadTickets />
            )}

            {activeTab === 'create' && (
              <Ticketing />
            )}

            {activeTab === 'kpi' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center"><BarChart3 className="w-6 h-6 mr-2 text-blue-600" />KPI Reports</h2>
                {/* SLA Table */}
                <div className="mb-6">
                  <h3 className="text-md font-semibold mb-2">SLA Table</h3>
                  <table className="min-w-full text-xs text-left text-gray-700 border mb-4">
                    <thead><tr><th className="py-1 px-2">Priority</th><th className="py-1 px-2">Initial Response Time</th><th className="py-1 px-2">Resolution Time</th></tr></thead>
                    <tbody>
                      <tr><td className="py-1 px-2">Critical</td><td className="py-1 px-2">10 min</td><td className="py-1 px-2">1 hour</td></tr>
                      <tr><td className="py-1 px-2">High</td><td className="py-1 px-2">1 hour</td><td className="py-1 px-2">2 hours</td></tr>
                      <tr><td className="py-1 px-2">Medium</td><td className="py-1 px-2">2 hours</td><td className="py-1 px-2">6 hours</td></tr>
                      <tr><td className="py-1 px-2">Low</td><td className="py-1 px-2">6 hours</td><td className="py-1 px-2">1 day</td></tr>
                    </tbody>
                  </table>
                </div>
                {/* KPI Filters */}
                <div className="flex flex-wrap gap-4 mb-6 items-end">
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">From Date</label>
                    <input type="date" className="border rounded px-2 py-1 text-sm" value={kpiFromDate} onChange={e => setKpiFromDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">To Date</label>
                    <input type="date" className="border rounded px-2 py-1 text-sm" value={kpiToDate} onChange={e => setKpiToDate(e.target.value)} />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-gray-600 mb-1">Period</label>
                    <select className="border rounded px-2 py-1 text-sm" value={kpiPeriod} onChange={e => setKpiPeriod(e.target.value)}>
                      <option value="custom">Custom</option>
                      <option value="week">This Week</option>
                      <option value="last2weeks">Last 2 Weeks</option>
                      <option value="last3weeks">Last 3 Weeks</option>
                      <option value="month">This Month</option>
                      <option value="last2months">Last 2 Months</option>
                      <option value="last3months">Last 3 Months</option>
                    </select>
                  </div>
                  <button className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded font-semibold" onClick={handleKpiFilterApply}>Apply</button>
                  <button className="bg-gray-200 hover:bg-gray-300 text-gray-700 px-4 py-2 rounded font-semibold" onClick={handleKpiFilterReset}>Reset</button>
                </div>
                {tickets.length === 0 ? (
                  <div className="text-gray-500">No tickets found for KPI analysis.</div>
                ) : (
                  (() => {
                    // Parse selected month
                    const [selYear, selMonth] = kpiSelectedMonth.split('-').map(Number);
                    // 1. Filter tickets for selected month
                    const monthTickets = tickets.filter(t => {
                      const created = t.created?.toDate ? t.created.toDate() : (t.created ? new Date(t.created) : null);
                      return created && created.getFullYear() === selYear && created.getMonth() + 1 === selMonth;
                    });
                    // 2. Group by week-of-month
                    const weekLabels = ['Week 1', 'Week 2', 'Week 3', 'Week 4'];
                    let weekMap = { 'Week 1': [], 'Week 2': [], 'Week 3': [], 'Week 4': [] };
                    monthTickets.forEach(ticket => {
                      const created = ticket.created?.toDate ? ticket.created.toDate() : (ticket.created ? new Date(ticket.created) : null);
                      if (!created) return;
                      const day = created.getDate();
                      let week = '';
                      if (day <= 7) week = 'Week 1';
                      else if (day <= 14) week = 'Week 2';
                      else if (day <= 21) week = 'Week 3';
                      else week = 'Week 4';
                      weekMap[week].push(ticket);
                    });
                    // 3. Aggregate KPIs for each week
                    const chartData = weekLabels.map(label => {
                      const groupTickets = weekMap[label];
                      if (!groupTickets || groupTickets.length === 0) {
                        return { period: label, open: 0, closed: 0, response: 0, resolution: 0, breached: 0 };
                      }
                      const kpi = computeKPIsForTickets(groupTickets);
                      return {
                        period: label,
                        open: kpi.openCount,
                        closed: kpi.closedCount,
                        response: kpi.avgResponse ? Number((kpi.avgResponse/1000/60).toFixed(2)) : 0,
                        resolution: kpi.avgResolution ? Number((kpi.avgResolution/1000/60).toFixed(2)) : 0,
                        breached: kpi.breachedCount
                      };
                    });
                    // 4. Custom vertical label renderer
                    const VerticalBarLabel = ({ x, y, width, height, value, name }) => {
                      if (height < 20) return null;
                      return (
                        <g>
                          <text
                            x={x + width / 2}
                            y={y + height / 2}
                            textAnchor="middle"
                            dominantBaseline="middle"
                            fontSize={Math.max(10, Math.min(width, height) / 3)}
                            fill="#fff"
                            transform={`rotate(-90, ${x + width / 2}, ${y + height / 2})`}
                            style={{ pointerEvents: 'none', fontWeight: 600 }}
                          >
                            {name}
                          </text>
                        </g>
                      );
                    };
                    // 5. Render grouped bar chart
                    return (
                      <>
                        <div className="mb-4 flex gap-4 items-center">
                          <span className="font-semibold text-gray-700">Month:</span>
                          <input type="month" value={kpiSelectedMonth} onChange={e => setKpiSelectedMonth(e.target.value)} className="border rounded px-2 py-1 text-sm" />
                        </div>
                        <div className="bg-white rounded-lg p-4 mb-6 border border-gray-100 shadow-sm" id="kpi-bar-chart">
                          <h3 className="text-lg font-semibold mb-2">KPI Bar Chart ({kpiSelectedMonth})</h3>
                          <ResponsiveContainer width="100%" height={250}>
                            <BarChart data={chartData}>
                              <CartesianGrid strokeDasharray="3 3" />
                              <XAxis dataKey="period" />
                              <YAxis />
                              <Tooltip />
                              <Legend />
                              <Bar dataKey="open" name="open" fill="#F2994A" label={props => <VerticalBarLabel {...props} name="open" />} />
                              <Bar dataKey="closed" name="close" fill="#34495E" label={props => <VerticalBarLabel {...props} name="close" />} />
                              <Bar dataKey="response" name="response time" fill="#56CCF2" label={props => <VerticalBarLabel {...props} name="response time" />} />
                              <Bar dataKey="resolution" name="resolution time" fill="#BB6BD9" label={props => <VerticalBarLabel {...props} name="resolution time" />} />
                              <Bar dataKey="breached" name="breached" fill="#EB5757" label={props => <VerticalBarLabel {...props} name="breached" />} />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex gap-4 mb-4">
                          <button
                            className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded font-semibold"
                            onClick={() => exportKpiToExcelWithChartImage(computeKPIsForTickets(tickets), 'kpi-bar-chart', projects.find(p => p.id === selectedProjectId)?.name || '')}
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
                                <th className="py-1 px-2">Priority</th>
                                <th className="py-1 px-2">Response Time</th>
                                <th className="py-1 px-2">Resolution Time</th>
                                <th className="py-1 px-2">Breached</th>
                                <th className="py-1 px-2">Status</th>
                              </tr>
                            </thead>
                            <tbody>
                              {computeKPIsForTickets(myTickets).details.map((row, idx) => (
                                <tr key={idx} className="border-t">
                                  <td className="py-1 px-2">{row.ticketNumber}</td>
                                  <td className="py-1 px-2">{row.subject}</td>
                                  <td className="py-1 px-2">{row.assignee || '-'}</td>
                                  <td className="py-1 px-2">{row.priority}</td>
                                  <td className="py-1 px-2">{row.responseTime ? (row.responseTime/1000/60).toFixed(2) + ' min' : 'N/A'}</td>
                                  <td className="py-1 px-2">{row.resolutionTime ? (row.resolutionTime/1000/60).toFixed(2) + ' min' : 'N/A'}</td>
                                  <td className="py-1 px-2">{row.breached ? <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded-full">Breached</span> : <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded-full">OK</span>}</td>
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
      </div>
    </div>
  );
};

export default ClientHeadDashboard;
 
 