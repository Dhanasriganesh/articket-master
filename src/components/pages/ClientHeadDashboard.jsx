import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
  Activity
} from 'lucide-react';
import { collection, query, where, getDocs, getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth, onAuthStateChanged } from 'firebase/auth';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from 'recharts';
 
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
  const [showLogoutConfirm, setShowLogoutConfirm] = useState(false);
 
  const auth = getAuth();
  const db = getFirestore();
 
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
 
  useEffect(() => {
    const fetchDashboardData = async () => {
      try {
        if (!user) return;
        // Get client head's name
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
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
        // Fetch projects
        const projectsQuery = query(collection(db, 'projects'));
        const projectsSnapshot = await getDocs(projectsQuery);
        const projectsData = projectsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setProjects(projectsData);
        // Fetch tickets
        const ticketsQuery = query(collection(db, 'tickets'));
        const ticketsSnapshot = await getDocs(ticketsQuery);
        const ticketsData = ticketsSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        setTickets(ticketsData);
        // Update stats
        setStats({
          totalClients: clientsData.length,
          activeProjects: projectsData.filter(project => project.status === 'active').length,
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
    try {
      await auth.signOut();
      navigate('/login');
    } catch (error) {
      console.error('Error signing out:', error);
    }
  };
 
  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, active: activeTab === 'dashboard' },
    { id: 'clients', label: 'People', icon: Users, active: activeTab === 'clients' },
   
    { id: 'tickets', label: 'Tickets', icon: MessageSquare, active: activeTab === 'tickets' }
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
 
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Logout Confirmation Modal */}
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
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
 
      {/* Sidebar */}
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
                <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
                  <Building className="w-6 h-6 text-white" />
                </div>
                <div>
                  <h1 className="text-l font-bold text-gray-900">Client Head</h1>
                 
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
                  <p className="text-sm font-medium text-gray-900">{clientHeadName}</p>
                  <p className="text-xs text-gray-500">Client Head</p>
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
                <h1 className="text-2xl font-bold text-gray-900">Welcome, {clientHeadName}!</h1>
                <p className="text-gray-600">Monitor client activities and project progress</p>
              </div>
            </div>
            <div className="flex items-center space-x-4">
              <button
                onClick={() => setShowLogoutConfirm(true)}
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
                
 
                
 
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Pending Tickets</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.pendingTickets}</p>
                    </div>
                    <div className="bg-yellow-100 rounded-lg p-3">
                      <AlertCircle className="w-6 h-6 text-yellow-600" />
                    </div>
                  </div>
                </div>
 
                <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Resolved Tickets</p>
                      <p className="text-2xl font-bold text-gray-900">{stats.resolvedTickets}</p>
                    </div>
                    <div className="bg-purple-100 rounded-lg p-3">
                      <CheckCircle className="w-6 h-6 text-purple-600" />
                    </div>
                  </div>
                </div>
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
 
              {/* Clients and Recent Tickets Grid */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Recent Tickets */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                  <div className="p-6 border-b border-gray-200">
                    <h2 className="text-xl font-semibold text-gray-900">Recent Tickets</h2>
                  </div>
                  <div className="divide-y divide-gray-200">
                    {tickets.slice(0, 5).map(ticket => (
                      <div key={ticket.id} className="p-6 hover:bg-gray-50">
                        <div className="flex items-center justify-between">
                          <div className="flex-1">
                            <h3 className="text-sm font-medium text-gray-900">{ticket.subject}</h3>
                            <div className="flex items-center gap-4 mt-1">
                              <p className="text-sm text-gray-500">
                                {ticket.customer}
                              </p>
                              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                                ticket.status === 'Open' ? 'bg-yellow-100 text-yellow-800' :
                                ticket.status === 'Closed' ? 'bg-green-100 text-green-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {ticket.status}
                              </span>
                            </div>
                          </div>
                          <button
                            onClick={() => navigate(`/ticket/${ticket.id}`)}
                            className="text-blue-600 hover:text-blue-700 font-medium text-sm"
                          >
                            View →
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
 
 
               
              </div>
            </div>
          )}
 
          {/* Other tabs content */}
          {activeTab === 'clients' && (
            <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Clients Management</h2>
              {/* Clients management content */}
            </div>
          )}
 
          
 
          {activeTab === 'tickets' && (
            <ClientHeadTickets setActiveTab={setActiveTab} />
          )}
 
          {activeTab === 'create' && (
            <div className="max-w-auto mx-auto">
              <Ticketing />
            </div>
          )}
        </main>
      </div>
    </div>
  );
};
 
export default ClientHeadDashboard;
 
 