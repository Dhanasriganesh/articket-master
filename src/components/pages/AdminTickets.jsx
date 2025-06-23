import { useState, useEffect } from 'react';
import {
  Paperclip,
  User,
  Mail,
  Clock,
  X,
  File,
  FileText,
  Image,
  Video,
  Loader2,
  Projector,
  Edit2,
  ChevronDown,
  ChevronUp,
  DownloadCloud,
  Filter,
  Trash2,
  Search,
  FolderKanban,
  AlertCircle,
  FolderOpen
} from 'lucide-react';
import { serverTimestamp, updateDoc, doc, onSnapshot, collection, query, orderBy, deleteDoc } from 'firebase/firestore';
import { db } from '../../firebase/config';
 
function AdminTickets() {
  const [tickets, setTickets] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedProject, setExpandedProject] = useState(null);
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [showFilterModal, setShowFilterModal] = useState(false);
  const [projects, setProjects] = useState([]);
  const [searchTerm, setSearchTerm] = useState('');
  const [filters, setFilters] = useState({
    priority: '',
    status: '',
    project: '',
    applied: false
  });
  const [editFormData, setEditFormData] = useState({
    status: '',
    priority: '',
    category: '',
    subject: '',
    description: ''
  });
 
  const priorities = [
    { value: 'Low', color: 'text-green-600', description: 'Non-urgent, can wait' },
    { value: 'Medium', color: 'text-yellow-600', description: 'Normal priority' },
    { value: 'High', color: 'text-red-600', description: 'Urgent, needs immediate attention' }
  ];
 
  const categories = [
    'Technical Issue',
    'Bug Report',
    'Feature Request',
    'Account Problem',
    'Billing Issue',
    'General Inquiry',
    'Complaint',
    'Feedback'
  ];
 
  const statuses = ['Open', 'In Progress', 'Resolved', 'Closed'];
 
  useEffect(() => {
    // Subscribe to real-time updates for tickets
    const unsubscribeTickets = onSnapshot(
      query(collection(db, 'tickets'), orderBy('created', 'desc')),
      (snapshot) => {
        const ticketsByProject = {};
        snapshot.forEach((doc) => {
          const ticket = { id: doc.id, ...doc.data() };
          const project = ticket.project || 'General';
          if (!ticketsByProject[project]) {
            ticketsByProject[project] = [];
          }
          ticketsByProject[project].push(ticket);
        });
        setTickets(ticketsByProject);
        setLoading(false);
      },
      (error) => {
        console.error('Error fetching tickets:', error);
        setLoading(false);
      }
    );
 
    // Subscribe to real-time updates for projects
    const unsubscribeProjects = onSnapshot(
      collection(db, 'projects'),
      (snapshot) => {
        const projectsData = snapshot.docs.map(doc => ({
          id: doc.id,
          name: doc.data().name
        }));
        setProjects(projectsData);
      },
      (error) => {
        console.error('Error fetching projects:', error);
      }
    );
 
    return () => {
      unsubscribeTickets();
      unsubscribeProjects();
    };
  }, []);
 
  const handleEditTicket = (ticket) => {
    setSelectedTicket(ticket);
    setEditFormData({
      status: ticket.status,
      priority: ticket.priority,
      category: ticket.category,
      subject: ticket.subject,
      description: ticket.description
    });
    setShowEditModal(true);
  };
 
  const handleDeleteTicket = async (ticketId) => {
    if (window.confirm('Are you sure you want to delete this ticket?')) {
      try {
        await deleteDoc(doc(db, 'tickets', ticketId));
      } catch (error) {
        console.error('Error deleting ticket:', error);
      }
    }
  };
 
  const handleUpdateTicket = async (e) => {
    e.preventDefault();
    if (!selectedTicket) return;
 
    try {
      await updateDoc(doc(db, 'tickets', selectedTicket.id), {
        ...editFormData,
        lastUpdated: serverTimestamp()
      });
      setShowEditModal(false);
      setSelectedTicket(null);
    } catch (error) {
      console.error('Error updating ticket:', error);
    }
  };
 
  const getPriorityColor = (priority) => {
    const priorityObj = priorities.find(p => p.value === priority);
    return priorityObj ? priorityObj.color : 'text-gray-600';
  };
 
  const getFileIcon = (file) => {
    const type = file.type.split('/')[0];
    switch (type) {
      case 'image':
        return <Image className="w-4 h-4" />;
      case 'video':
        return <Video className="w-4 h-4" />;
      case 'application':
        if (file.type.includes('pdf')) {
          return <FileText className="w-4 h-4" />;
        }
        return <File className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };
 
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
 
  const applyFilters = () => {
    setFilters(prev => ({ ...prev, applied: true }));
    setShowFilterModal(false);
  };
 
  const clearFilters = () => {
    setFilters({
      priority: '',
      status: '',
      project: '',
      applied: false
    });
  };
 
  const filteredTickets = Object.entries(tickets).reduce((acc, [project, projectTickets]) => {
    if (filters.applied || searchTerm) {
      const filteredProjectTickets = projectTickets.filter(ticket => {
        const matchesPriority = !filters.priority || ticket.priority === filters.priority;
        const matchesProject = !filters.project || ticket.project === filters.project;
        const matchesStatus = !filters.status || ticket.status === filters.status;
        const matchesSearch = !searchTerm ||
          ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ticket.description?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ticket.email?.toLowerCase().includes(searchTerm.toLowerCase());
       
        return matchesPriority && matchesProject && matchesStatus && matchesSearch;
      });
 
      if (filteredProjectTickets.length > 0) {
        acc[project] = filteredProjectTickets;
      }
    } else {
      acc[project] = projectTickets;
    }
    return acc;
  }, {});
 
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }
 
  return (
    <div className="space-y-6">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Ticket Management</h1>
          <p className="text-gray-600 mt-1">Manage and track all support tickets</p>
        </div>
      </div>
 
      {/* Filter Bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          {/* Search Input */}
          <div className="relative">
            <input
              type="text"
              placeholder="Search tickets..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
            <Search className="w-5 h-5 text-gray-400 absolute left-3 top-1/2 transform -translate-y-1/2" />
          </div>
 
          {/* Status Filter */}
          <select
            value={filters.status}
            onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Statuses</option>
            {statuses.map(status => (
              <option key={status} value={status}>{status}</option>
            ))}
          </select>
 
          {/* Priority Filter */}
          <select
            value={filters.priority}
            onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Priorities</option>
            {priorities.map(priority => (
              <option key={priority.value} value={priority.value}>{priority.value}</option>
            ))}
          </select>
 
          {/* Project Filter */}
          <select
            value={filters.project}
            onChange={(e) => setFilters(prev => ({ ...prev, project: e.target.value }))}
            className="w-full px-4 py-2 border border-gray-200 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="">All Projects</option>
            {projects.map(project => (
              <option key={project.id} value={project.name}>{project.name}</option>
            ))}
          </select>
        </div>
 
        {/* Search Button */}
        <div className="mt-4 flex items-center justify-end space-x-3">
          <button
            onClick={() => setFilters(prev => ({ ...prev, applied: true }))}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Search className="w-4 h-4 inline-block mr-1" /> Search
          </button>
          {(filters.applied || searchTerm) && (
            <button
              onClick={() => {
                setFilters({ priority: '', status: '', project: '', applied: false });
                setSearchTerm('');
              }}
              className="px-3 py-1.5 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors flex items-center space-x-2 text-sm"
            >
              <X className="w-4 h-4" />
              <span>Clear All Filters</span>
            </button>
          )}
        </div>
      </div>
 
      {/* Tickets Grid */}
      {!filters.applied ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Filter className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">Set filters and click Search to view tickets</h3>
          <p className="text-gray-600">Please select your filter criteria and click the Search button to display tickets.</p>
        </div>
      ) : loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
        </div>
      ) : Object.keys(filteredTickets).length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-8 text-center">
          <div className="mx-auto w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-4">
            <Filter className="w-8 h-8 text-gray-400" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 mb-2">No tickets found</h3>
          <p className="text-gray-600">
            {filters.applied || searchTerm
              ? "No tickets match your current filters. Try adjusting your search criteria."
              : "There are no tickets in the system yet."}
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-6">
          {Object.entries(filteredTickets).map(([project, projectTickets]) => (
            <div key={project} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
              {/* Project Header */}
              <div
                className="p-4 border-b border-gray-200 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                onClick={() => setExpandedProject(expandedProject === project ? null : project)}
              >
                <div className="flex items-center space-x-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Projector className="w-5 h-5 text-blue-600" />
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">{project}</h3>
                    <p className="text-sm text-gray-600">{projectTickets.length} tickets</p>
                  </div>
                </div>
                <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                  {expandedProject === project ? (
                    <ChevronUp className="w-5 h-5 text-gray-600" />
                  ) : (
                    <ChevronDown className="w-5 h-5 text-gray-600" />
                  )}
                </button>
              </div>
 
              {/* Tickets List */}
              {expandedProject === project && (
                <div className="divide-y divide-gray-200">
                  {projectTickets.map((ticket) => (
                    <div key={ticket.id} className="p-4 hover:bg-gray-50 transition-colors">
                      <div className="flex items-start justify-between">
                        <div className="space-y-1 flex-1">
                          <div className="flex items-center space-x-2">
                            <span className={`text-sm font-medium ${getPriorityColor(ticket.priority)}`}>
                              {ticket.priority}
                            </span>
                            <span className="text-gray-400">•</span>
                            <span className={`text-sm font-medium ${
                              ticket.status === 'Open' ? 'text-green-600' :
                              ticket.status === 'In Progress' ? 'text-blue-600' :
                              ticket.status === 'Resolved' ? 'text-purple-600' : 'text-gray-600'
                            }`}>
                              {ticket.status}
                            </span>
                          </div>
                          <h4 className="text-base font-medium text-gray-900">{ticket.subject}</h4>
                          <p className="text-sm text-gray-600 line-clamp-2">{ticket.description}</p>
                         
                          {/* Ticket Details */}
                          <div className="flex items-center space-x-4 mt-2">
                            <div className="flex items-center text-sm text-gray-500">
                              <User className="w-4 h-4 mr-1" />
                              <span>{ticket.createdBy}</span>
                            </div>
                            <div className="flex items-center text-sm text-gray-500">
                              <Mail className="w-4 h-4 mr-1" />
                              <span>{ticket.email}</span>
                            </div>
                            <div className="flex items-center text-sm text-gray-500">
                              <Clock className="w-4 h-4 mr-1" />
                              <span>{new Date(ticket.created?.seconds * 1000).toLocaleDateString()}</span>
                            </div>
                          </div>
 
                          {/* Attachments */}
                          {ticket.attachments && ticket.attachments.length > 0 && (
                            <div className="mt-3 flex flex-wrap gap-2">
                              {ticket.attachments.map((file, index) => (
                                <div
                                  key={index}
                                  className="flex items-center space-x-2 px-3 py-1 bg-gray-100 rounded-lg text-sm"
                                >
                                  {getFileIcon(file)}
                                  <span className="text-gray-700">{formatFileSize(file.size)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
 
                        {/* Actions */}
                        <div className="flex items-center space-x-2 ml-4">
                          <button
                            onClick={() => handleEditTicket(ticket)}
                            className="p-2 text-gray-600 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleDeleteTicket(ticket.id)}
                            className="p-2 text-gray-600 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
 
      {/* Edit Ticket Modal */}
      {showEditModal && selectedTicket && (
        <div className="fixed inset-0 flex items-center justify-center p-4 z-50">
          {/* Glossy Backdrop */}
          <div className="absolute inset-0 bg-gradient-to-br from-white-500/30 to-white-500/30 backdrop-blur-md"></div>
          {/* Modal Content */}
          <div className="relative bg-white/95 backdrop-blur-sm rounded-2xl shadow-2xl w-full max-w-lg border border-white/20">
            <div className="relative p-8">
              {/* Decorative Elements */}
              <div className="absolute top-0 left-0 w-full h-full overflow-hidden rounded-2xl pointer-events-none">
                <div className="absolute -top-32 -left-32 w-64 h-64 bg-blue-500 rounded-full opacity-10 blur-3xl"></div>
                <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-purple-500 rounded-full opacity-10 blur-3xl"></div>
              </div>
              {/* Modal Header */}
              <div className="flex justify-between items-center mb-6 relative">
                <div>
                  <h3 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
                    <Edit2 className="w-6 h-6 text-blue-600" /> Edit Ticket
                  </h3>
                  <p className="text-sm text-gray-600 mt-1">Update ticket details</p>
                </div>
                <button
                  onClick={() => setShowEditModal(false)}
                  className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100/50 rounded-lg transition-colors"
                >
                  <X className="w-6 h-6" />
                </button>
              </div>
              {/* Ticket Summary */}
              <div className="mb-6 p-4 rounded-xl bg-gradient-to-r from-blue-50 to-purple-50 flex items-center gap-6 border border-blue-100 shadow-sm">
                <div className="flex-1">
                  <div className="flex items-center gap-2 text-sm text-gray-700 mb-1">
                    <span className="font-semibold">Ticket #</span>
                    <span className="text-blue-600">{selectedTicket.ticketNumber}</span>
                  </div>
                  <div className="flex items-center gap-4 text-xs text-gray-500">
                    <User className="w-4 h-4 mr-1 inline-block" /> {selectedTicket.createdBy}
                    <Mail className="w-4 h-4 mr-1 inline-block" /> {selectedTicket.email}
                    <Clock className="w-4 h-4 mr-1 inline-block" /> {selectedTicket.created?.seconds ? new Date(selectedTicket.created.seconds * 1000).toLocaleString() : 'N/A'}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${getPriorityColor(selectedTicket.priority)} bg-gray-100`}>{selectedTicket.priority}</span>
                  <span className={`text-xs font-semibold px-3 py-1 rounded-full ${
                    selectedTicket.status === 'Open' ? 'bg-green-100 text-green-800' :
                    selectedTicket.status === 'In Progress' ? 'bg-blue-100 text-blue-800' :
                    selectedTicket.status === 'Resolved' ? 'bg-purple-100 text-purple-800' :
                    'bg-gray-100 text-gray-800'
                  }`}>{selectedTicket.status}</span>
                </div>
              </div>
              <hr className="my-4 border-blue-100" />
              {/* Edit Form */}
              <form onSubmit={handleUpdateTicket} className="space-y-5 relative">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <FolderKanban className="w-4 h-4 text-blue-400" /> Status
                  </label>
                  <select
                    value={editFormData.status}
                    onChange={(e) => setEditFormData({ ...editFormData, status: e.target.value })}
                    className="w-full px-4 py-2 bg-white/50 backdrop-blur-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  >
                    {statuses.map((status) => (
                      <option key={status} value={status}>{status}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <AlertCircle className="w-4 h-4 text-yellow-400" /> Priority
                  </label>
                  <select
                    value={editFormData.priority}
                    onChange={(e) => setEditFormData({ ...editFormData, priority: e.target.value })}
                    className="w-full px-4 py-2 bg-white/50 backdrop-blur-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-yellow-500 focus:border-yellow-500 transition-colors"
                  >
                    {priorities.map((priority) => (
                      <option key={priority.value} value={priority.value}>{priority.value}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <FolderOpen className="w-4 h-4 text-purple-400" /> Category
                  </label>
                  <select
                    value={editFormData.category}
                    onChange={(e) => setEditFormData({ ...editFormData, category: e.target.value })}
                    className="w-full px-4 py-2 bg-white/50 backdrop-blur-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500 focus:border-purple-500 transition-colors"
                  >
                    {categories.map((category) => (
                      <option key={category} value={category}>{category}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <FileText className="w-4 h-4 text-blue-500" /> Subject
                  </label>
                  <input
                    type="text"
                    value={editFormData.subject}
                    onChange={(e) => setEditFormData({ ...editFormData, subject: e.target.value })}
                    className="w-full px-4 py-2 bg-white/50 backdrop-blur-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1 flex items-center gap-1">
                    <FileText className="w-4 h-4 text-blue-500" /> Description
                  </label>
                  <textarea
                    value={editFormData.description}
                    onChange={(e) => setEditFormData({ ...editFormData, description: e.target.value })}
                    rows={4}
                    className="w-full px-4 py-2 bg-white/50 backdrop-blur-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-colors resize-none"
                  />
                </div>
                <div className="flex justify-end space-x-3 pt-4">
                  <button
                    type="button"
                    onClick={() => setShowEditModal(false)}
                    className="px-4 py-2 text-gray-700 bg-gray-100/80 backdrop-blur-sm rounded-xl hover:bg-gray-200/80 transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-gradient-to-r from-blue-600 to-blue-700 text-white rounded-xl hover:from-blue-700 hover:to-blue-800 shadow-lg shadow-blue-500/25 hover:shadow-blue-500/40 transition-all duration-200"
                  >
                    Update Ticket
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
 
export default AdminTickets;
 
 
 
 