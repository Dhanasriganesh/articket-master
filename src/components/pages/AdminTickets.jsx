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
import TicketDetails from './TicketDetails';
import { BsTicketFill, BsFolderFill } from 'react-icons/bs';

function AdminTickets() {
  const [tickets, setTickets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [deletedProjects, setDeletedProjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [activeTab, setActiveTab] = useState('live');
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterProject, setFilterProject] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [editFormData, setEditFormData] = useState({ status: '', priority: '', category: '', subject: '', description: '' });

  useEffect(() => {
    const unsubscribe = onSnapshot(query(collection(db, 'tickets')), (snapshot) => {
      const ticketList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setTickets(ticketList);
      setLoading(false);
    }, (err) => {
      setError('Failed to load tickets.');
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const unsubscribe = onSnapshot(collection(db, 'projects'), (snapshot) => {
      const projectList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
      setProjects(projectList);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    const checkDeletedProjects = () => {
      const deletedProjectMap = new Map();
      
      tickets.forEach(ticket => {
        if (ticket.projectId && !projects.find(p => p.id === ticket.projectId)) {
          if (!deletedProjectMap.has(ticket.projectId)) {
            deletedProjectMap.set(ticket.projectId, {
              id: ticket.projectId,
              name: ticket.project || `Deleted Project (${ticket.projectId})`,
              isDeleted: true
            });
          }
        }
      });
      
      const deletedProjectsList = Array.from(deletedProjectMap.values());
      setDeletedProjects(deletedProjectsList);
    };

    if (tickets.length > 0 && projects.length > 0) {
      checkDeletedProjects();
    }
  }, [tickets, projects]);

  const handleTicketClick = (ticketId) => setSelectedTicketId(ticketId);
  const handleBackToTickets = () => setSelectedTicketId(null);

  const handleEditTicket = (ticket) => {
    setSelectedTicketId(ticket.id);
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
        setTickets(tickets.filter(t => t.id !== ticketId));
      } catch (error) {
        alert('Error deleting ticket.');
      }
    }
  };

  const handleUpdateTicket = async (e) => {
    e.preventDefault();
    if (!selectedTicketId) return;
    try {
      await updateDoc(doc(db, 'tickets', selectedTicketId), {
        ...editFormData,
        lastUpdated: serverTimestamp()
      });
      setShowEditModal(false);
      setSelectedTicketId(null);
    } catch (error) {
      alert('Error updating ticket.');
    }
  };

  const getTicketsForTab = () => {
    if (activeTab === 'live') {
      return tickets.filter(ticket => {
        return !ticket.projectId || projects.find(p => p.id === ticket.projectId);
      });
    } else if (activeTab === 'deleted') {
      return tickets.filter(ticket => {
        return ticket.projectId && !projects.find(p => p.id === ticket.projectId);
      });
    }
    return [];
  };

  const getProjectsForFilter = () => {
    if (activeTab === 'live') {
      return projects;
    } else if (activeTab === 'deleted') {
      return deletedProjects;
    }
    return [];
  };

  const filteredTickets = filtersApplied
    ? getTicketsForTab().filter(ticket => {
        const matchesStatus = filterStatus === 'All' || ticket.status === filterStatus;
        const matchesPriority = filterPriority === 'All' || ticket.priority === filterPriority;
        const matchesProject = filterProject === 'All' || ticket.projectId === filterProject || ticket.project === filterProject;
        const matchesSearch =
          ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
          ticket.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase());
        return matchesStatus && matchesPriority && matchesProject && matchesSearch;
      })
    : [];

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading tickets...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
        </div>
      </div>
    );
  }

  if (selectedTicketId && !showEditModal) {
    return <TicketDetails ticketId={selectedTicketId} onBack={handleBackToTickets} />;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-gray-900 flex items-center">
          <BsTicketFill className="mr-3 text-blue-600" /> Admin Tickets
        </h1>
        
      </div>
      <div className="mb-6">
        <div className="border-b border-gray-200">
          <nav className="-mb-px flex space-x-8">
            <button
              onClick={() => {
                setActiveTab('live');
                setFiltersApplied(false);
                setFilterProject('All');
              }}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'live'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Live Tickets
            </button>
            <button
              onClick={() => {
                setActiveTab('deleted');
                setFiltersApplied(false);
                setFilterProject('All');
              }}
              className={`py-2 px-1 border-b-2 font-medium text-sm ${
                activeTab === 'deleted'
                  ? 'border-red-500 text-red-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
              }`}
            >
              Closed Projects
            </button>
          </nav>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow border border-gray-100">
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Project</label>
          <select
            value={filterProject}
            onChange={e => setFilterProject(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          >
            <option value="All">All</option>
            {getProjectsForFilter().map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Status</label>
          <select
            value={filterStatus}
            onChange={e => setFilterStatus(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          >
            <option value="All">All</option>
            <option value="Open">Open</option>
            <option value="In Progress">In Progress</option>
            <option value="Resolved">Resolved</option>
            <option value="Closed">Closed</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Priority</label>
          <select
            value={filterPriority}
            onChange={e => setFilterPriority(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          >
            <option value="All">All</option>
            <option value="High">High</option>
            <option value="Medium">Medium</option>
            <option value="Low">Low</option>
          </select>
        </div>
        <div className="flex-1 min-w-[180px]">
          <input
            type="text"
            placeholder="Search by subject or ID..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          />
        </div>
        <button
          onClick={() => setFiltersApplied(true)}
          className={`px-4 py-2 text-white rounded-lg transition-colors ${
            activeTab === 'live' 
              ? 'bg-blue-600 hover:bg-blue-700' 
              : 'bg-red-600 hover:bg-red-700'
          }`}
        >
          Go
        </button>
        <button
          onClick={() => {
            setFilterStatus('All');
            setFilterPriority('All');
            setFilterProject('All');
            setSearchTerm('');
            setFiltersApplied(false);
          }}
          className="text-xs text-blue-600 hover:underline px-2 py-1 rounded"
        >
          Clear Filters
        </button>
      </div>
      {filtersApplied && filteredTickets.length > 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
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
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Last Updated</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {filteredTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => handleTicketClick(ticket.id)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">{ticket.ticketNumber}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.subject}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        ticket.status === 'Open' ? 'bg-blue-100 text-blue-800' :
                        ticket.status === 'In Progress' ? 'bg-yellow-100 text-yellow-800' :
                        ticket.status === 'Resolved' ? 'bg-green-100 text-green-800' :
                        'bg-gray-100 text-gray-800'
                      }`}>
                        {ticket.status}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.priority}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.email}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{ticket.assignedTo?.email || '-'}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{formatTimestamp(ticket.lastUpdated)}</td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      <button
                        className="text-blue-600 hover:underline mr-2"
                        onClick={e => { e.stopPropagation(); handleEditTicket(ticket); }}
                      >Edit</button>
                      <button
                        className="text-red-600 hover:underline"
                        onClick={e => { e.stopPropagation(); handleDeleteTicket(ticket.id); }}
                      >Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtersApplied ? (
        <div className="text-center text-gray-500 py-12">
          {activeTab === 'live' ? 'No live tickets found.' : 'No tickets from deleted projects found.'}
        </div>
      ) : (
        <div className="text-center text-gray-500 py-12">
          {activeTab === 'live' ? 'Set filters and click "Go" to view live tickets.' : 'Set filters and click "Go" to view tickets from deleted projects.'}
        </div>
      )}
      {showEditModal && (
        <div className="fixed inset-0 flex items-center justify-center z-50 bg-black bg-opacity-30">
          <div className="bg-white rounded-xl shadow-xl p-8 max-w-md w-full">
            <h2 className="text-xl font-bold mb-4">Edit Ticket</h2>
            <form onSubmit={handleUpdateTicket} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
                <select
                  value={editFormData.status}
                  onChange={e => setEditFormData({ ...editFormData, status: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="Open">Open</option>
                  <option value="In Progress">In Progress</option>
                  <option value="Resolved">Resolved</option>
                  <option value="Closed">Closed</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Priority</label>
                <select
                  value={editFormData.priority}
                  onChange={e => setEditFormData({ ...editFormData, priority: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                >
                  <option value="High">High</option>
                  <option value="Medium">Medium</option>
                  <option value="Low">Low</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={editFormData.category}
                  onChange={e => setEditFormData({ ...editFormData, category: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Subject</label>
                <input
                  type="text"
                  value={editFormData.subject}
                  onChange={e => setEditFormData({ ...editFormData, subject: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Description</label>
                <textarea
                  value={editFormData.description}
                  onChange={e => setEditFormData({ ...editFormData, description: e.target.value })}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2"
                  rows={3}
                />
              </div>
              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  className="px-4 py-2 bg-gray-200 rounded-lg hover:bg-gray-300"
                  onClick={() => setShowEditModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
                >
                  Save Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default AdminTickets;

function formatTimestamp(ts) {
  if (!ts) return '';
  if (typeof ts === 'string') return new Date(ts).toLocaleString();
  if (typeof ts.toDate === 'function') return ts.toDate().toLocaleString();
  return '';
}

 
 
 