import React, { useState, useEffect, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  Mail,
  AlertCircle,
  CheckCircle,
  Clock,
  XCircle,
  Plus,
  MessageSquare,
  Send,
  User,
  Search,
  Filter,
  ChevronDown,
  Loader2,
  Paperclip,
  Trash2,
  RefreshCw,
  Calendar,
  Tag,
  ChevronRight,
  LogOut,
  Home,
  FileText,
  Settings,
  Bell,
  Menu,
  X,
  ChevronsLeft,
  ChevronsRight,
  Flag,
  Edit,
  ChevronLeft,
  BarChart3,
  PieChart,
  Zap,
  TrendingUp,
  Activity
} from 'lucide-react';
import { collection, query, onSnapshot, doc, updateDoc, serverTimestamp, where, getDoc, getDocs } from 'firebase/firestore';
import { db } from '../../firebase/config';
import { auth } from '../../firebase/config';
import Ticketing from './Ticketing'; // Import the Ticketing component
import ClientTickets from './ClientTickets'; // Import the ClientTickets component
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend
} from 'recharts';
import LogoutModal from './LogoutModal';
import TicketDetails from './TicketDetails';
 
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
    // eslint-disable-next-line
  }, [target, duration]);
  return count;
}
 
function ClientDashboard() {
  const [tickets, setTickets] = useState([]);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [error, setError] = useState(null);
  const [newResponse, setNewResponse] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [filterStatus, setFilterStatus] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [clientName, setClientName] = useState('');
  const [requesterNameFilter, setRequesterNameFilter] = useState('');
  const [technicianFilter, setTechnicianFilter] = useState('');
  const [dueDateFilter, setDueDateFilter] = useState('');
  const [createdDateFilter, setCreatedDateFilter] = useState('');
  const [hasSearched, setHasSearched] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [authChecked, setAuthChecked] = useState(false);
  const [user, setUser] = useState(null);
  const navigate = useNavigate();
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const unsubscribeRef = useRef(null);
  const [showLogoutModal, setShowLogoutModal] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [searchParams] = useSearchParams();
  const [projects, setProjects] = useState([]);
  const [selectedProjectId, setSelectedProjectId] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
 
  // Animated counts for priorities (must be at top level, not inside JSX)
  const highCount = useCountUp(tickets.filter(t => t.priority === 'High').length);
  const mediumCount = useCountUp(tickets.filter(t => t.priority === 'Medium').length);
  const lowCount = useCountUp(tickets.filter(t => t.priority === 'Low').length);
 
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
 
  useEffect(() => {
    if (authChecked && user) {
      setIsLoading(true);
      setError(null);
      setupTicketListener(user);
    }
  }, [authChecked, user]);
 
  const setupTicketListener = (firebaseUser) => {
    try {
      if (!firebaseUser) {
        setError('Please sign in to view tickets');
        setIsLoading(false);
        return;
      }
      // Set client name from email
      const email = firebaseUser.email;
      const name = email.split('@')[0];
      setClientName(name.charAt(0).toUpperCase() + name.slice(1));
      // Get user's project first
      let currentProject = 'General';
      const getUserProject = async () => {
        try {
          const userDocRef = doc(db, 'users', firebaseUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            currentProject = userData.project || 'General';
            console.log('User project for dashboard:', currentProject);
          }
        } catch (err) {
          console.error('Error fetching user project:', err);
          currentProject = 'General';
        }
        // Query tickets for the user's project (all tickets, not just user's own)
        const q = query(
          collection(db, 'tickets'),
          where('project', '==', currentProject)
        );
        const unsubscribe = onSnapshot(q,
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
                  project: data.project || 'General',
                  email: data.email || 'Unknown',
                  priority: data.priority || 'Low'
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
        unsubscribeRef.current = unsubscribe;
      };
      getUserProject();
    } catch (err) {
      console.error('Connection error:', err);
      setError('Unable to connect to the server. Please check your internet connection and try again.');
      setIsLoading(false);
    }
  };
 
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
 
  useEffect(() => {
    setupTicketListener();
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
      }
    };
  }, []);
 
  const handleLogout = () => setShowLogoutModal(true);
  const handleLogoutConfirm = async () => {
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
  const handleLogoutCancel = () => setShowLogoutModal(false);
 
  const sendResponse = async (ticketId, message) => {
    if (!message.trim()) return;
   
    setIsSending(true);
    setError(null);
   
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const ticket = tickets.find(t => t.id === ticketId);
     
      const newResponse = {
        message: message.trim(),
        timestamp: new Date(),
        sender: 'customer'
      };
     
      await updateDoc(ticketRef, {
        customerResponses: [...(ticket.customerResponses || []), newResponse],
        lastUpdated: serverTimestamp()
      });
     
      setSelectedTicket(prev => ({
        ...prev,
        customerResponses: [...(prev.customerResponses || []), newResponse]
      }));
     
      setNewResponse('');
     
      // Scroll to bottom after sending message
      setTimeout(() => {
        scrollToBottom();
      }, 150);
     
    } catch (error) {
      console.error('Error sending response:', error);
      setError('Failed to send response. Please try again.');
    } finally {
      setIsSending(false);
    }
  };
 
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
 
  const formatMessageTime = (timestamp) => {
    if (!timestamp) return '';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const now = new Date();
    const yesterday = new Date(now);
    yesterday.setDate(yesterday.getDate() - 1);
 
    const timeStr = date.toLocaleTimeString('en-US', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
 
    if (date.toDateString() === now.toDateString()) {
      return timeStr;
    } else if (date.toDateString() === yesterday.toDateString()) {
      return `Yesterday ${timeStr}`;
    } else if (date.getFullYear() === now.getFullYear()) {
      return `${date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric'
      })} ${timeStr}`;
    } else {
      return `${date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric'
      })} ${timeStr}`;
    }
  };
 
  // New function to format date and time for table display
  const formatTableDateTime = (timestamp) => {
    if (!timestamp) return '-';
    const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };
 
  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = ticket.subject.toLowerCase().includes(searchTerm.toLowerCase()) ||
                         ticket.ticketNumber.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesRequester = requesterNameFilter === '' || ticket.customer.toLowerCase().includes(requesterNameFilter.toLowerCase());
    const matchesTechnician = technicianFilter === '' || (ticket.adminResponses.length > 0 && ticket.adminResponses[0].message.toLowerCase().includes(technicianFilter.toLowerCase())); // This is a placeholder, will need proper technician field
    const matchesDueDate = dueDateFilter === '' || (ticket.dueDate && new Date(ticket.dueDate).toDateString() === new Date(dueDateFilter).toDateString());
    const matchesCreatedDate = createdDateFilter === '' || (ticket.created && new Date(ticket.created.toDate()).toDateString() === new Date(createdDateFilter).toDateString());
 
    if (filterStatus === 'All') {
      return matchesSearch && matchesRequester && matchesTechnician && matchesDueDate && matchesCreatedDate;
    }
    return matchesSearch && matchesRequester && matchesTechnician && matchesDueDate && matchesCreatedDate && ticket.status === filterStatus;
  });
 
  const handleSearch = () => {
    setHasSearched(true);
  };
 
  const clearFilters = () => {
    setSearchTerm('');
    setFilterStatus('All');
    setRequesterNameFilter('');
    setTechnicianFilter('');
    setDueDateFilter('');
    setCreatedDateFilter('');
    setHasSearched(false);
  };
 
  const sidebarItems = [
    { id: 'dashboard', label: 'Dashboard', icon: Home, active: activeTab === 'dashboard' },
    { id: 'tickets', label: 'Tickets', icon: FileText, active: activeTab === 'tickets' },
    { id: 'create', label: 'Create Ticket', icon: Plus, active: activeTab === 'create' },
    
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
            m => m.email === user.email && m.role === 'client'
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
 
  // Filter tickets for current user (assigned to or raised by)
  const currentUserEmail = user?.email;
  const myTickets = tickets.filter(t =>
    (t.assignedTo && t.assignedTo.email === currentUserEmail) ||
    t.email === currentUserEmail
  );
 
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
      {/* LogoutModal always rendered above, not blurred */}
      <LogoutModal open={showLogoutModal} onCancel={handleLogoutCancel} onConfirm={handleLogoutConfirm} loading={signingOut} />
      {/* Blurred content (sidebar + main) */}
      <div className={showLogoutModal ? 'flex flex-1 filter blur-sm pointer-events-none select-none' : 'flex flex-1'}>
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
                    <h1 className="text-l font-bold text-gray-900">Client Portal</h1>
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
                    <p className="text-sm font-medium text-gray-900">{clientName.toUpperCase()}</p>
                    <p className="text-xs text-gray-500">Client</p>
                  </div>
                </div>
              )}
              <button
                onClick={handleLogout}
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
                  <h1 className="text-2xl font-bold text-gray-900">Project: {tickets[0]?.project || 'General'}</h1>
                  <p className="text-gray-600">Manage your support tickets and communications</p>
                </div>
              </div>
              <div className="flex items-center space-x-4">
                
                <button
                  onClick={handleLogout}
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
                {/* Stats Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                      // Pass filter data to ClientTickets component
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
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'All',
                        priority: 'All',
                        raisedBy: 'me'
                      }));
                    }}
                    className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 hover:shadow-md hover:border-blue-200 transition-all duration-300 text-left group"
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium text-gray-600 mb-1">Tickets</p>
                        <p className="text-3xl font-bold text-gray-900">{tickets.filter(t => t.email === auth.currentUser?.email).length}</p>
                        <p className="text-xs text-gray-500 mt-1">Your tickets</p>
                      </div>
                      <div className="w-12 h-12 bg-blue-50 rounded-lg flex items-center justify-center group-hover:bg-blue-100 transition-colors">
                        <User className="w-6 h-6 text-blue-600" />
                      </div>
                    </div>
                  </button>
                  <button 
                    onClick={() => {
                      setActiveTab('tickets');
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'Open',
                        priority: 'All',
                        raisedBy: 'all'
                      }));
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
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'In Progress',
                        priority: 'All',
                        raisedBy: 'all'
                      }));
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
                      sessionStorage.setItem('ticketFilter', JSON.stringify({
                        status: 'Resolved',
                        priority: 'All',
                        raisedBy: 'all'
                      }));
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

                {/* Filtered Tickets Table */}
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

                  {/* Priority Counts Cards */}
                  <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 flex flex-col justify-center">
                    <h3 className="text-lg font-semibold text-gray-900 mb-6 flex items-center">
                      <BarChart3 className="w-5 h-5 mr-2 text-blue-600" />
                      Ticket Priority Counts
                    </h3>
                    <div className="flex flex-col md:flex-row gap-6 justify-center items-center">
                      <div className="flex-1 bg-red-50 border border-red-200 rounded-xl p-6 flex flex-col items-center shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => {
                        setActiveTab('tickets');
                        sessionStorage.setItem('ticketFilter', JSON.stringify({
                          status: 'All',
                          priority: 'High',
                          raisedBy: 'all'
                        }));
                      }}>
                        <Flag className="w-8 h-8 text-red-500 mb-2" />
                        <span className="text-2xl font-bold text-red-600">{highCount}</span>
                        <span className="text-sm font-medium text-red-700 mt-1">High Priority</span>
                      </div>
                      <div className="flex-1 bg-yellow-50 border border-yellow-200 rounded-xl p-6 flex flex-col items-center shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => {
                        setActiveTab('tickets');
                        sessionStorage.setItem('ticketFilter', JSON.stringify({
                          status: 'All',
                          priority: 'Medium',
                          raisedBy: 'all'
                        }));
                      }}>
                        <Flag className="w-8 h-8 text-yellow-500 mb-2" />
                        <span className="text-2xl font-bold text-yellow-600">{mediumCount}</span>
                        <span className="text-sm font-medium text-yellow-700 mt-1">Medium Priority</span>
                      </div>
                      <div className="flex-1 bg-green-50 border border-green-200 rounded-xl p-6 flex flex-col items-center shadow-sm cursor-pointer hover:shadow-md transition" onClick={() => {
                        setActiveTab('tickets');
                        sessionStorage.setItem('ticketFilter', JSON.stringify({
                          status: 'All',
                          priority: 'Low',
                          raisedBy: 'all'
                        }));
                      }}>
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
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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
                          <FileText className="w-6 h-6 text-blue-600" />
                        </div>
                        <div className="text-left">
                          <p className="font-semibold text-gray-900 text-lg">View Project Tickets</p>
                          <p className="text-gray-600 text-sm">Check status of all project tickets</p>
                        </div>
                      </div>
                    </button>
                  </div>
                </div>
              </div>
            )}
 
 {activeTab === 'tickets' && <ClientTickets setActiveTab={setActiveTab} />}
 
            {activeTab === 'create' && (
              <div className="max-w-auto mx-auto">
                <Ticketing onTicketCreated={() => setActiveTab('tickets')} />
              </div>
            )}
 
            {/* Conditional rendering for other tabs like notifications, settings */}
            {activeTab === 'notifications' && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Notifications</h3>
                <p className="text-gray-600">No new notifications.</p>
              </div>
            )}
            {activeTab === 'settings' && (
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-200">
                <h3 className="text-xl font-bold text-gray-900 mb-4">Settings</h3>
                <p className="text-gray-600">Account settings will be available here.</p>
              </div>
            )}
            {activeTab === 'mytickets' && (
              <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200">
                <h2 className="text-xl font-semibold text-gray-900 mb-4">My Tickets</h2>
                {tickets.filter(t => t.email === user?.email).length === 0 ? (
                  <div className="text-gray-500">You have not raised any tickets.</div>
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
                        {tickets.filter(t => t.email === user?.email).map((ticket, idx) => (
                          <tr key={idx} className="border-t">
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
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
 
export default ClientDashboard;
 