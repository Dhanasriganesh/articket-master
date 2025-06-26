import { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  AlertCircle,
  CheckCircle,
  Clock,
  Plus,
  MessageSquare,
  User,
  Loader2,
  RefreshCw,
  LogOut,
  Home,
  FileText,
  Menu,
  ChevronsLeft,
  ChevronsRight
} from 'lucide-react';
import { collection, query, onSnapshot, doc, where, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { auth } from '../../firebase/config';
import Ticketing from './Ticketing'; // Import the Ticketing component
import EmployeeTickets from './EmployeeTickets'; // Import the EmployeeTickets component
import LogoutModal from './LogoutModal';
 
function EmployeeDashboard() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket] = useState(null);
  const [error, setError] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [employeeName, setEmployeeName] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const messagesContainerRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState('');
  const [searchParams] = useSearchParams();
 
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setUser(firebaseUser);
      setAuthChecked(true);
      if (!firebaseUser) {
        setError('Please sign in to view tickets');
        setIsLoading(false);
      }
    });
    return () => unsubscribe();
  }, []);
 
  // Handle URL parameters for tab navigation
  useEffect(() => {
    const tabParam = searchParams.get('tab');
    if (tabParam && ['dashboard', 'tickets', 'create'].includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [searchParams]);
 
  // Fetch projects when user is authenticated
  useEffect(() => {
    if (authChecked && user) {
      setIsLoading(true);
      setError(null);
      const fetchProjects = async () => {
        try {
          const projectsQuery = query(collection(db, 'projects'));
          const projectsSnapshot = await getDocs(projectsQuery);
          const projectsData = projectsSnapshot.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(project =>
              (project.members || []).some(
                m => m.email === user.email && m.role === 'employee'
              )
            );
          setProjects(projectsData);
          if (projectsData.length > 0 && !selectedProjectId) {
            setSelectedProjectId(projectsData[0].id);
          }
          setIsLoading(false);
        } catch {
          setError('Failed to load projects.');
          setIsLoading(false);
        }
      };
      fetchProjects();
    }
  }, [authChecked, user, db]);
 
  // Ticket listener updates when selectedProjectId, projects, or user changes
  useEffect(() => {
    if (!authChecked || !user) return;
    setIsLoading(true);
    setError(null);
    let unsubscribe;
    // Set employee name from email
    const email = user.email;
    const name = email.split('@')[0];
    setEmployeeName(name.charAt(0).toUpperCase() + name.slice(1));
    if (selectedProjectId && selectedProjectId !== 'all') {
      // Single project
      const q = query(
        collection(db, 'tickets'),
        where('projectId', '==', selectedProjectId)
      );
      unsubscribe = onSnapshot(q,
        (querySnapshot) => {
          try {
            const ticketsData = [];
            querySnapshot.forEach((doc) => {
              const data = doc.data();
              ticketsData.push({
                id: doc.id,
                subject: data.subject || 'No Subject',
                description: data.description || 'No Description',
                status: data.status || 'Open',
                created: data.created || null,
                dueDate: data.dueDate || null,
                ticketNumber: data.ticketNumber || `TKT-${doc.id}`,
                adminResponses: data.adminResponses || [],
                customerResponses: data.customerResponses || [],
                customer: data.customer || 'Unknown',
                project: data.project || 'General'
              });
            });
            // Sort tickets by created date
            ticketsData.sort((a, b) => {
              const dateA = a.created?.toDate?.() || new Date(a.created);
              const dateB = b.created?.toDate?.() || new Date(b.created);
              return dateB - dateA;
            });
            setTickets(ticketsData);
            setError(null);
            setIsLoading(false);
          } catch (err) {
            console.error('Error processing tickets:', err);
            setError('Error processing tickets. Please try again.');
            setIsLoading(false);
          }
        },
        (error) => {
          console.error('Firestore error:', error);
          setError('Error connecting to the server. Please try again.');
          setIsLoading(false);
        }
      );
    } else if (selectedProjectId === 'all' && projects.length > 0) {
      // All projects: fetch tickets for all managed projects
      const projectIds = projects.map(p => p.id);
      let allTickets = [];
      let unsubscribes = [];
      const batchSize = 10;
      for (let i = 0; i < projectIds.length; i += batchSize) {
        const batchIds = projectIds.slice(i, i + batchSize);
        const q = query(
          collection(db, 'tickets'),
          where('projectId', 'in', batchIds)
        );
        const batchUnsub = onSnapshot(q, (querySnapshot) => {
          let batchTickets = [];
          querySnapshot.forEach((doc) => {
            const data = doc.data();
            batchTickets.push({
              id: doc.id,
              subject: data.subject || 'No Subject',
              description: data.description || 'No Description',
              status: data.status || 'Open',
              created: data.created || null,
              dueDate: data.dueDate || null,
              ticketNumber: data.ticketNumber || `TKT-${doc.id}`,
              adminResponses: data.adminResponses || [],
              customerResponses: data.customerResponses || [],
              customer: data.customer || 'Unknown',
              project: data.project || 'General'
            });
          });
          allTickets = allTickets.filter(t => !batchTickets.some(bt => bt.id === t.id)).concat(batchTickets);
          // Sort tickets by created date
          allTickets.sort((a, b) => {
            const dateA = a.created?.toDate?.() || new Date(a.created);
            const dateB = b.created?.toDate?.() || new Date(b.created);
            return dateB - dateA;
          });
          setTickets([...allTickets]);
          setError(null);
          setIsLoading(false);
        }, (error) => {
          console.error('Firestore error:', error);
          setError('Error connecting to the server. Please try again.');
          setIsLoading(false);
        });
        unsubscribes.push(batchUnsub);
      }
      unsubscribe = () => unsubscribes.forEach(unsub => unsub());
    } else {
      setTickets([]);
      setIsLoading(false);
      return;
    }
    unsubscribeRef.current = unsubscribe;
    return () => {
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, [authChecked, user, selectedProjectId, projects]);
 
  // Enhanced scroll to bottom function
  const scrollToBottom = () => {
    if (messagesContainerRef.current) {
      const container = messagesContainerRef.current;
      // Use requestAnimationFrame to ensure DOM is updated
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
      });
    }
  };
 
  // Scroll to bottom when messages change
  useEffect(() => {
    if (selectedTicket) {
      // Use setTimeout to ensure messages are rendered
      setTimeout(() => {
        scrollToBottom();
      }, 100);
    }
  }, [selectedTicket?.adminResponses, selectedTicket?.customerResponses, selectedTicket?.id]);
 
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
    { id: 'tickets', label: 'My Tickets', icon: FileText, active: activeTab === 'tickets' },
    { id: 'create', label: 'Create Ticket', icon: Plus, active: activeTab === 'create' }
   
   
  ];
 
  const renderSidebarItem = (item) => {
    const IconComponent = item.icon;
    return (
      <button
        key={item.id}
        onClick={() => {
          // For 'tickets' tab, we no longer navigate to a separate route
          // Instead, we just set the activeTab to render the component within the dashboard
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
 
  // Fetch latest user role from Firestore on mount
  useEffect(() => {
    const fetchRole = async () => {
      if (auth.currentUser) {
        const userDoc = await getDoc(doc(db, 'users', auth.currentUser.uid));
        if (userDoc.exists()) {
          const role = userDoc.data().role;
          // If not employee, redirect accordingly
          if (role === 'client') {
            navigate('/clientdashboard');
          } else if (role === 'admin') {
            navigate('/admin');
          }
        }
      }
    };
    fetchRole();
  }, [navigate]);
 
  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-200">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <AlertCircle className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Connection Error</h2>
          <p className="text-gray-600 mb-6 leading-relaxed">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white px-6 py-3 rounded-xl hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center justify-center space-x-2 font-medium shadow-lg hover:shadow-xl"
          >
            <RefreshCw className="w-5 h-5" />
            <span>Retry Connection</span>
          </button>
        </div>
      </div>
    );
  }
 
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-md w-full text-center border border-gray-200">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-6">
            <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-3">Loading Dashboard</h2>
          <p className="text-gray-600 leading-relaxed">Please wait while we connect to the server...</p>
        </div>
      </div>
    );
  }
 
  return (
    <div className="flex h-screen bg-gray-50">
      {/* Logout Confirmation Modal */}
      <LogoutModal open={showLogoutModal} onCancel={handleLogoutCancel} onConfirm={handleLogout} loading={signingOut} />
      {/* Mobile Sidebar Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}
 
      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-50 transform transition-all duration-300 ease-in-out ${ sidebarCollapsed ? 'w-20' : 'w-64' } bg-white shadow-xl lg:translate-x-0 lg:static ${ sidebarOpen ? 'translate-x-0' : '-translate-x-full' }`}>
        <div className="flex flex-col h-full">
          {/* Sidebar Header */}
          <div className="p-6 border-b border-gray-200 flex items-center justify-between">
            {!sidebarCollapsed && (
              <div className="flex items-center space-x-3">
                <div className="w-10 h-10 bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl flex items-center justify-center">
                  <MessageSquare className="w-6 h-6 text-white" />
                </div>
                <div>
                 
                  <p className="text-sm text-gray-500">Employee Portal</p>
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
                  <p className="text-sm font-medium text-gray-900">{employeeName.toUpperCase()}</p>
                  <p className="text-xs text-gray-500">Employee</p>
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
                <h1 className="text-2xl font-bold text-gray-900">Welcome, {employeeName.toUpperCase()}!</h1>
                <p className="text-gray-600">Manage your assigned support tickets and communications</p>
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
        <main className="flex-1 overflow-auto p-6">
          {projects.length > 1 && (
            <div className="mb-6">
              <label className="mr-2 font-semibold text-gray-700">Select Project:</label>
              <select
                value={selectedProjectId}
                onChange={e => setSelectedProjectId(e.target.value)}
                className="border border-gray-300 rounded px-3 py-2"
              >
                <option value="all">All Projects</option>
                {projects.map(project => (
                  <option key={project.id} value={project.id}>{project.name}</option>
                ))}
              </select>
            </div>
          )}
          {activeTab === 'dashboard' && (
            <div className="space-y-6">
              {/* Stats Cards */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Total Tickets</p>
                      <p className="text-2xl font-bold text-gray-900">{tickets.length}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <FileText className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Open Tickets</p>
                      <p className="text-2xl font-bold text-blue-600">{tickets.filter(t => t.status === 'Open').length}</p>
                    </div>
                    <div className="w-12 h-12 bg-blue-100 rounded-xl flex items-center justify-center">
                      <AlertCircle className="w-6 h-6 text-blue-600" />
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">In Progress</p>
                      <p className="text-2xl font-bold text-amber-600">{tickets.filter(t => t.status === 'In Progress').length}</p>
                    </div>
                    <div className="w-12 h-12 bg-amber-100 rounded-xl flex items-center justify-center">
                      <Clock className="w-6 h-6 text-amber-600" />
                    </div>
                  </div>
                </div>
                <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-sm font-medium text-gray-600">Resolved</p>
                      <p className="text-2xl font-bold text-emerald-600">{tickets.filter(t => t.status === 'Resolved').length}</p>
                    </div>
                    <div className="w-12 h-12 bg-emerald-100 rounded-xl flex items-center justify-center">
                      <CheckCircle className="w-6 h-6 text-emerald-600" />
                    </div>
                  </div>
                </div>
              </div>
 
              {/* Quick Actions */}
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">Quick Actions</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => navigate('/ticketing')}
                    className="flex items-center space-x-3 p-4 border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all duration-200"
                  >
                    <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                      {/* Removed Plus icon */}
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">Create New Ticket</p>
                      <p className="text-sm text-gray-500">Submit a new support request</p>
                    </div>
                  </button>
                  <button
                    onClick={() => setActiveTab('tickets')}
                    className="flex items-center space-x-3 p-4 border border-gray-200 rounded-xl hover:border-blue-300 hover:bg-blue-50 transition-all duration-200"
                  >
                    <div className="w-10 h-10 bg-green-100 rounded-lg flex items-center justify-center">
                      <FileText className="w-5 h-5 text-green-600" />
                    </div>
                    <div className="text-left">
                      <p className="font-medium text-gray-900">View My Tickets</p>
                      <p className="text-sm text-gray-500">Check status of assigned tickets</p>
                    </div>
                  </button>
                </div>
              </div>
            </div>
          )}
 
          {activeTab === 'tickets' && <EmployeeTickets selectedProjectId={selectedProjectId} allProjectIds={projects.map(p => p.id)} />}
 
          {activeTab === 'create' && (
            <div className="max-w-auto mx-auto">
              <Ticketing onTicketCreated={() => setActiveTab('tickets')} />
            </div>
          )}
 
         
        </main>
      </div>
    </div>
  );
}
 
export default EmployeeDashboard;