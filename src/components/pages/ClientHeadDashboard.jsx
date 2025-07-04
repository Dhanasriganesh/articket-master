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
  FileText
} from 'lucide-react';
import { collection, query, where, getDocs, getFirestore, doc, getDoc, onSnapshot } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend
} from 'recharts';
import LogoutModal from './LogoutModal';
import TicketDetails from './TicketDetails';
import { computeKPIsForTickets, exportKpiToExcelWithChartImage } from './ProjectManagerDashboard';
 
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
        // Fetch tickets for the client head's project only
        let ticketsData = [];
        if (clientHeadProject) {
          const ticketsQuery = query(collection(db, 'tickets'), where('project', '==', clientHeadProject));
        const ticketsSnapshot = await getDocs(ticketsQuery);
          ticketsData = ticketsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        }
        setTickets(ticketsData);
        // Update stats
        setStats({
          totalClients: clientsData.length,
          activeProjects: projects.filter(project => project.status === 'active').length,
          pendingTickets: ticketsData.filter(ticket => ticket.status === 'Open').length,
          resolvedTickets: ticketsData.filter(ticket => ticket.status === 'Closed').length
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
  const myTickets = tickets.filter(t =>
    (t.assignedTo && t.assignedTo.email === currentUserEmail) ||
    t.email === currentUserEmail
  );
 
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
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                  
                </div>
 
                {/* My Project Tickets Table */}
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200 mt-6">
                  <h2 className="text-lg font-semibold text-gray-900 mb-4">My Tickets</h2>
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
      </div>
    </div>
  );
};
 
export default ClientHeadDashboard;
 
 