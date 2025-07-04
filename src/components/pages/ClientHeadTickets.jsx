import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, getDocs, doc, updateDoc, arrayUnion, serverTimestamp, getDoc } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { Link, useNavigate } from 'react-router-dom';
import { BsTicketFill, BsFolderFill } from 'react-icons/bs';
import TicketDetails from './TicketDetails';
import { sendEmail } from '../../utils/sendEmail';
import { fetchProjectMemberEmails } from '../../utils/emailUtils';
 
// Helper to safely format timestamps
function formatTimestamp(ts) {
  if (!ts) return '';
  if (typeof ts === 'string') {
    return new Date(ts).toLocaleString();
  }
  if (typeof ts.toDate === 'function') {
    return ts.toDate().toLocaleString();
  }
  return '';
}
 
const ClientHeadTickets = ({ setActiveTab }) => {
  const [ticketsData, setTicketsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [filterStatus, setFilterStatus] = useState(['All']);
  const [filterPriority, setFilterPriority] = useState(['All']);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRaisedByEmployee, setFilterRaisedByEmployee] = useState('all');
  const [filterRaisedByClient, setFilterRaisedByClient] = useState('all');
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [selectedProject, setSelectedProject] = useState('VMM');
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' for Newest, 'asc' for Oldest
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const priorityDropdownRef = useRef(null);
  const navigate = useNavigate();
  const [projectMembers, setProjectMembers] = useState([]);
  const [employeeMembers, setEmployeeMembers] = useState([]);
  const [clientMembers, setClientMembers] = useState([]);
 
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async user => {
      if (user) {
        setLoading(true);
        setCurrentUserEmail(user.email);
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const userData = userDocSnap.data();
          setCurrentUserData(userData);
          setSelectedProject(userData.project || 'VMM');
        }
        try {
          const filterData = sessionStorage.getItem('ticketFilter');
          if (filterData) {
            const parsedFilter = JSON.parse(filterData);
            setFilterStatus(parsedFilter.status);
            setFilterPriority(parsedFilter.priority);
            sessionStorage.removeItem('ticketFilter');
          }
        } catch (err) {
          console.error('Error parsing filter data:', err);
        }
      } else {
        setLoading(false);
        setTicketsData([]);
      }
    });
    return () => unsubscribeAuth();
  }, []);
 
  useEffect(() => {
    if (!selectedProject) return;
    setLoading(true);
    // Fetch project members from projects collection
    const fetchProjectMembers = async () => {
      try {
        const projectsRef = collection(db, 'projects');
        const q = query(projectsRef, where('name', '==', selectedProject));
        const snapshot = await getDocs(q);
        if (!snapshot.empty) {
          const projectDoc = snapshot.docs[0].data();
          const members = projectDoc.members || [];
          setProjectMembers(members);
          setEmployeeMembers(members.filter(m => m.role === 'employee' || m.role === 'project_manager'));
          setClientMembers(members.filter(m => m.role === 'client' || m.role === 'client_head'));
        } else {
          setProjectMembers([]);
          setEmployeeMembers([]);
          setClientMembers([]);
        }
      } catch (err) {
        setProjectMembers([]);
        setEmployeeMembers([]);
        setClientMembers([]);
      }
      setLoading(false);
    };
    fetchProjectMembers();
    // Fetch tickets for the project
    const ticketsCollectionRef = collection(db, 'tickets');
    const qTickets = query(
      ticketsCollectionRef,
      where('project', '==', selectedProject)
    );
    const unsubscribeTickets = onSnapshot(qTickets, (snapshot) => {
      const tickets = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setTicketsData(tickets);
      setLoading(false);
    }, (err) => {
      setError('Failed to load tickets for the project.');
      setLoading(false);
    });
    return () => unsubscribeTickets();
  }, [selectedProject]);
 
  useEffect(() => {
    function handleClickOutside(event) {
      if (statusDropdownRef.current && !statusDropdownRef.current.contains(event.target)) setStatusDropdownOpen(false);
      if (priorityDropdownRef.current && !priorityDropdownRef.current.contains(event.target)) setPriorityDropdownOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);
 
  const summarize = (arr, allLabel, options) => {
    if (arr.includes('All')) return allLabel;
    if (arr.length === 0) return allLabel;
    return arr.join(', ');
  };
 
  const handleTicketClick = (ticketId) => {
    setSelectedTicketId(ticketId);
  };
 
  const handleBackToTickets = () => {
    setSelectedTicketId(null);
  };
 
  const handleAssignTicket = async (ticketId, selectedUserEmail) => {
    console.log('handleAssignTicket called with:', ticketId, selectedUserEmail);
    const assignable = [...employees, ...clients];
    const selectedUser = assignable.find(u => u.email === selectedUserEmail) || {
      email: currentUserEmail,
      id: 'me',
      firstName: '',
      lastName: '',
    };
    const ticket = ticketsData.find(t => t.id === ticketId);
 
    if (!ticketId || !auth.currentUser || !selectedUser || !ticket) return;
 
    const ticketRef = doc(db, 'tickets', ticketId);
    const newAssignee = {
      name: selectedUser.name || selectedUser.email.split('@')[0],
      email: selectedUser.email
    };
    const assignerUsername = currentUserEmail.split('@')[0];
 
    const response = {
      message: `Ticket assigned to ${newAssignee.name} by ${assignerUsername}.`,
      timestamp: new Date().toISOString(),
      authorEmail: 'system',
      authorRole: 'system',
    };
 
    try {
      await updateDoc(ticketRef, {
        assignedTo: newAssignee,
        assignedBy: assignerUsername,
        lastUpdated: serverTimestamp()
      });
      // Log the assignment as a comment for history, but do NOT send a comment email
      await updateDoc(ticketRef, {
        customerResponses: arrayUnion(response)
      });
      // Only send the assignment email
      const emailParams = {
        to_email: ticket.email,
        to_name: ticket.customer || ticket.name || ticket.email,
        subject: `Your ticket has been assigned (ID: ${ticket.ticketNumber})`,
        ticket_number: ticket.ticketNumber,
        assigned_to: newAssignee.name,
        assigned_by_name: assignerUsername,
        assigned_by_email: currentUserEmail,
        project: ticket.project,
        category: ticket.category,
        priority: ticket.priority,
        ticket_link: `https://articket.vercel.app`,
      };
      console.log('Assignment emailParams:', emailParams);
      await sendEmail(emailParams, 'template_igl3oxn');
    } catch (err) {
      console.error('Error assigning ticket:', err);
    }
  };
 
  const handleCheckboxFilter = (filter, setFilter, value) => {
    if (value === 'All') {
      setFilter(['All']);
    } else {
      setFilter(prev => {
        let next = prev.includes('All') ? [] : [...prev];
        if (next.includes(value)) {
          next = next.filter(v => v !== value);
        } else {
          next.push(value);
        }
        if (next.length === 0) return ['All'];
        return next;
      });
    }
  };
 
  // Compute filtered tickets
  const filteredTickets = ticketsData.filter(ticket => {
    const matchesStatus = filterStatus.includes('All') || filterStatus.includes(ticket.status);
    const matchesPriority = filterPriority.includes('All') || filterPriority.includes(ticket.priority);
    const matchesSearch =
      ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase());
   
    // Check both employee and client filters
    let matchesRaisedBy = true;
    if (filterRaisedByEmployee !== 'all') {
      if (filterRaisedByEmployee === 'me') {
        matchesRaisedBy = ticket.email === currentUserEmail;
      } else {
        matchesRaisedBy = ticket.email === filterRaisedByEmployee;
      }
    } else if (filterRaisedByClient !== 'all') {
      if (filterRaisedByClient === 'me') {
        matchesRaisedBy = ticket.email === currentUserEmail;
      } else {
        matchesRaisedBy = ticket.email === filterRaisedByClient;
      }
    }
   
    return matchesStatus && matchesPriority && matchesSearch && matchesRaisedBy;
  });
 
  // Sort tickets by date
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const dateA = a.created?.toDate ? a.created.toDate() : new Date(a.created);
    const dateB = b.created?.toDate ? b.created.toDate() : new Date(b.created);
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
  });
 
  // Ticket counts for cards
  const totalTickets = ticketsData.length;
  const openTickets = ticketsData.filter(t => t.status === 'Open').length;
  const inProgressTickets = ticketsData.filter(t => t.status === 'In Progress').length;
  const resolvedTickets = ticketsData.filter(t => t.status === 'Resolved').length;
  const closedTickets = ticketsData.filter(t => t.status === 'Closed').length;
 
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
 
  if (selectedTicketId) {
    return <TicketDetails ticketId={selectedTicketId} onBack={handleBackToTickets} onAssign={handleAssignTicket} />;
  }
 
  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <BsTicketFill className="mr-3 text-blue-600" />Tickets
          </h1>
          {/* Ticket Stats Cards */}
          <div className="flex gap-2">
            <div className="bg-white rounded-lg shadow border border-gray-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-gray-500">Total</span>
              <span className="text-lg font-bold text-gray-900">{totalTickets}</span>
            </div>
            <div className="bg-blue-50 rounded-lg shadow border border-blue-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-blue-600">Open</span>
              <span className="text-lg font-bold text-blue-700">{openTickets}</span>
            </div>
            <div className="bg-yellow-50 rounded-lg shadow border border-yellow-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-yellow-600">In Progress</span>
              <span className="text-lg font-bold text-yellow-700">{inProgressTickets}</span>
            </div>
            <div className="bg-green-50 rounded-lg shadow border border-green-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-green-600">Resolved</span>
              <span className="text-lg font-bold text-green-700">{resolvedTickets}</span>
            </div>
            <div className="bg-gray-50 rounded-lg shadow border border-gray-200 px-3 py-2 flex flex-col items-center min-w-[70px]">
              <span className="text-xs text-gray-600">Closed</span>
              <span className="text-lg font-bold text-gray-700">{closedTickets}</span>
            </div>
          </div>
        </div>
        
      </div>
 
      <div className="flex justify-between items-center mb-8">
        <div>
          <button
            onClick={() => navigate('/client-head-dashboard?tab=create')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center"
          >
            <BsFolderFill className="mr-2" />
            Create New Ticket
          </button>
        </div>
      </div>
 
      {/* Filters Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow border border-gray-100">
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Status</label>
          <div className="relative" ref={statusDropdownRef}>
            <button type="button" className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[120px] text-left" onClick={() => setStatusDropdownOpen(v => !v)}>
              {summarize(filterStatus, 'All', ['Open', 'In Progress', 'Resolved', 'Closed'])}
            </button>
            {statusDropdownOpen && (
              <div className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 p-2 min-w-[180px]">
                <label className="flex items-center text-sm">
                  <input type="checkbox" checked={filterStatus.includes('All')} onChange={() => handleCheckboxFilter(filterStatus, setFilterStatus, 'All')} /> All
                </label>
                {['Open', 'In Progress', 'Resolved', 'Closed'].map(status => (
                  <label key={status} className="flex items-center text-sm">
                    <input type="checkbox" checked={filterStatus.includes(status)} onChange={() => handleCheckboxFilter(filterStatus, setFilterStatus, status)} /> {status}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Priority</label>
          <div className="relative" ref={priorityDropdownRef}>
            <button type="button" className="border border-gray-200 rounded-lg px-3 py-2 text-sm bg-white min-w-[120px] text-left" onClick={() => setPriorityDropdownOpen(v => !v)}>
              {summarize(filterPriority, 'All', ['High', 'Medium', 'Low'])}
            </button>
            {priorityDropdownOpen && (
              <div className="absolute z-10 bg-white border border-gray-200 rounded-lg shadow-lg mt-1 p-2 min-w-[180px]">
                <label className="flex items-center text-sm">
                  <input type="checkbox" checked={filterPriority.includes('All')} onChange={() => handleCheckboxFilter(filterPriority, setFilterPriority, 'All')} /> All
                </label>
                {['High', 'Medium', 'Low'].map(priority => (
                  <label key={priority} className="flex items-center text-sm">
                    <input type="checkbox" checked={filterPriority.includes(priority)} onChange={() => handleCheckboxFilter(filterPriority, setFilterPriority, priority)} /> {priority}
                  </label>
                ))}
              </div>
            )}
          </div>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Raised By Employee</label>
          <select
            value={filterRaisedByEmployee}
            onChange={e => {
              setFilterRaisedByEmployee(e.target.value);
              setFilterRaisedByClient('all'); // Reset client filter when employee filter changes
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[140px]"
          >
            <option value="all">All Employees</option>
            <option value="me">Me</option>
            {employeeMembers.map(member => (
              <option key={member.email} value={member.email}>
                {member.firstName && member.lastName ? `${member.firstName} ${member.lastName}` : member.email.split('@')[0]}{member.role === 'project_manager' ? ' (Manager)' : ''}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Raised By Client</label>
          <select
            value={filterRaisedByClient}
            onChange={e => {
              setFilterRaisedByClient(e.target.value);
              setFilterRaisedByEmployee('all'); // Reset employee filter when client filter changes
            }}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50 min-w-[140px]"
          >
            <option value="all">All Clients</option>
            {clientMembers.map(member => (
              <option key={member.email} value={member.email}>
                {member.firstName && member.lastName ? `${member.firstName} ${member.lastName}` : member.email.split('@')[0]}{member.role === 'client_head' ? ' (Client Head)' : ''}
              </option>
            ))}
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
        <div>
          <label className="text-xs font-semibold text-gray-500 mr-2">Sort by Date</label>
          <select
            value={sortOrder}
            onChange={e => setSortOrder(e.target.value)}
            className="border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-gray-50"
          >
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>
        </div>
        <button
          onClick={() => setFiltersApplied(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-semibold ml-2"
          type="button"
        >
          Search
        </button>
        <button
          onClick={() => {
            setFilterStatus(['All']);
            setFilterPriority(['All']);
            setFilterRaisedByEmployee('all');
            setFilterRaisedByClient('all');
            setSearchTerm('');
            setFiltersApplied(false);
          }}
          className="ml-auto text-xs text-blue-600 hover:underline px-2 py-1 rounded"
          type="button"
        >
          Clear Filters
        </button>
      </div>
 
      {/* Only show tickets if filtersApplied is true */}
      {filtersApplied && sortedTickets.length > 0 ? (
        <div className="bg-white shadow overflow-hidden sm:rounded-md">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ticket ID
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Subject
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Priority
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Raised By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned To
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned By
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Last Updated
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {sortedTickets.map((ticket) => (
                  <tr
                    key={ticket.id}
                    onClick={() => handleTicketClick(ticket.id)}
                    className="hover:bg-gray-50 cursor-pointer transition-colors duration-150"
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {ticket.ticketNumber}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.subject}
                    </td>
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
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.priority}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.customer}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(() => {
                        // Always just show the assignee's name/email or '-'. No assign dropdown for client head.
                        return ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-';
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.assignedBy || '-'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {formatTimestamp(ticket.lastUpdated)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : filtersApplied ? (
        <div className="text-gray-400 text-center py-12">No tickets found for selected filters.</div>
      ) : (
        <div className="text-gray-400 text-center py-12">Select filters and click 'Apply Filters' to view tickets.</div>
      )}
    </>
  );
};
 
export default ClientHeadTickets;
 