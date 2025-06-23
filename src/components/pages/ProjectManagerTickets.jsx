import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { BsTicketFill, BsFolderFill } from 'react-icons/bs';
import TicketDetails from './TicketDetails';
import { sendEmail } from '../../utils/sendEmail';
import PropTypes from 'prop-types';

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

const ProjectManagerTickets = ({ setActiveTab, selectedProjectId, allProjectIds }) => {
  const [ticketsData, setTicketsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterRaisedByEmployee, setFilterRaisedByEmployee] = useState('all');
  const [filterRaisedByClient, setFilterRaisedByClient] = useState('all');
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [currentUserData, setCurrentUserData] = useState(null);

  useEffect(() => {
    if (!selectedProjectId || (selectedProjectId === 'all' && (!allProjectIds || allProjectIds.length === 0))) {
      setTicketsData([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    // Fetch employees and clients for the selected project(s)
    const fetchUsersAndTickets = async () => {
      try {
        const usersRef = collection(db, 'users');
        let projectIdsToFetch = [];
        if (selectedProjectId === 'all') {
          projectIdsToFetch = allProjectIds;
        } else {
          projectIdsToFetch = [selectedProjectId];
        }
        // Fetch employees and clients for all projects (optional: can be improved to deduplicate)
        // Fetch tickets for the selected project(s)
        const ticketsCollectionRef = collection(db, 'tickets');
        let tickets = [];
        if (projectIdsToFetch.length === 1) {
          // Single project
          const q = query(
            ticketsCollectionRef,
            where('projectId', '==', projectIdsToFetch[0])
          );
          const unsubscribeTickets = onSnapshot(q, (snapshot) => {
            tickets = snapshot.docs.map(doc => ({
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
        } else if (projectIdsToFetch.length > 1 && projectIdsToFetch.length <= 10) {
          // Multiple projects (up to 10)
          const q = query(
            ticketsCollectionRef,
            where('projectId', 'in', projectIdsToFetch)
          );
          const unsubscribeTickets = onSnapshot(q, (snapshot) => {
            tickets = snapshot.docs.map(doc => ({
              id: doc.id,
              ...doc.data()
            }));
            setTicketsData(tickets);
            setLoading(false);
          }, (err) => {
            setError('Failed to load tickets for the projects.');
            setLoading(false);
          });
          return () => unsubscribeTickets();
        } else {
          // More than 10 projects: batch queries (not implemented here)
          setError('Too many projects to display tickets. Please select a single project.');
          setTicketsData([]);
          setLoading(false);
        }
      } catch (err) {
        setError('Failed to load users or tickets.');
        setLoading(false);
      }
    };
    fetchUsersAndTickets();
    // eslint-disable-next-line
  }, [selectedProjectId, allProjectIds]);

  const handleTicketClick = (ticketId) => {
    setSelectedTicketId(ticketId);
  };

  const handleBackToTickets = () => {
    setSelectedTicketId(null);
  };

  const handleAssignTicket = async (ticketId, selectedUserEmail) => {
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
      name: selectedUser.email.split('@')[0],
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
      await updateDoc(ticketRef, {
        customerResponses: arrayUnion(response)
      });

      const emailParams = {
        name: newAssignee.name,
        email: newAssignee.email,
        project: ticket.project,
        subject: ticket.subject,
        category: ticket.category,
        priority: ticket.priority,
      };
      await sendEmail(emailParams);
    } catch (error) {
      console.error('Error assigning ticket:', error);
    }
  };

  // Add this function to allow unassigning a ticket
  const handleUnassignTicket = async (ticketId) => {
    if (!ticketId || !auth.currentUser) return;
    const ticketRef = doc(db, 'tickets', ticketId);
    try {
      await updateDoc(ticketRef, {
        assignedTo: null,
        assignedBy: null,
        lastUpdated: serverTimestamp(),
      });
    } catch (err) {
      console.error('Error unassigning ticket:', err);
    }
  };

  // Compute filtered tickets
  const filteredTickets = ticketsData.filter(ticket => {
    const matchesStatus = filterStatus === 'All' || ticket.status === filterStatus;
    const matchesPriority = filterPriority === 'All' || ticket.priority === filterPriority;
    const matchesSearch =
      ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.ticketNumber?.toLowerCase().includes(searchTerm.toLowerCase());
   
    // Check both employee and client filters
    let matchesRaisedBy = true;
    const ticketUser = employees.find(emp => emp.email === ticket.email)
      ? 'employee'
      : clients.find(client => client.email === ticket.email)
        ? 'client'
        : null;

    if (ticketUser === 'employee') {
      matchesRaisedBy = filterRaisedByEmployee === 'all' ||
        (filterRaisedByEmployee === 'me' && ticket.email === currentUserEmail) ||
        employees.find(emp => emp.id === filterRaisedByEmployee)?.email === ticket.email;
    } else if (ticketUser === 'client') {
      matchesRaisedBy = filterRaisedByClient === 'all' ||
        (filterRaisedByClient === 'me' && ticket.email === currentUserEmail) ||
        clients.find(client => client.id === filterRaisedByClient)?.email === ticket.email;
    }
   
    return matchesStatus && matchesPriority && matchesSearch && matchesRaisedBy;
  });

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
    return <TicketDetails ticketId={selectedTicketId} onBack={handleBackToTickets} />;
  }

  return (
    <>
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <BsTicketFill className="mr-3 text-blue-600" /> Project Tickets
          </h1>
        </div>
        {setActiveTab ? (
          <button
            onClick={() => setActiveTab('create')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center"
          >
            <BsFolderFill className="mr-2" />
            Create New Ticket
          </button>
        ) : (
          <button
            onClick={() => setActiveTab('create')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center"
          >
            <BsFolderFill className="mr-2" />
            Create New Ticket
          </button>
        )}
      </div>

      {/* Updated Filters Bar */}
      <div className="flex flex-wrap items-center gap-4 mb-6 bg-white p-4 rounded-xl shadow border border-gray-100">
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
            {employees.map(employee => (
              <option key={employee.id} value={employee.id}>
                {employee.displayName}
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
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.displayName}
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
        <button
          onClick={() => {
            setFilterStatus('All');
            setFilterPriority('All');
            setFilterRaisedByEmployee('all');
            setFilterRaisedByClient('all');
            setSearchTerm('');
          }}
          className="ml-auto text-xs text-blue-600 hover:underline px-2 py-1 rounded"
        >
          Clear Filters
        </button>
      </div>

      {filteredTickets.length > 0 ? (
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
                {filteredTickets.map((ticket) => (
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
                      {ticket.email === currentUserEmail ? (
                        <span className="text-blue-600 font-medium">Me</span>
                      ) : (
                        employees.find(emp => emp.email === ticket.email)?.name || ticket.email
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(() => {
                        const creatorIsClient = clients.some(c => c.email === ticket.email);
                        const isProjectManager = currentUserData?.role === 'project_manager';
                        // Always include the project manager as an assignable option
                        const assignable = isProjectManager
                          ? [{ email: currentUserEmail, id: 'pm', name: currentUserData?.firstName ? `${currentUserData.firstName} ${currentUserData.lastName}` : currentUserEmail.split('@')[0] }, ...employees]
                          : employees;
                        return (
                          <div className="flex items-center gap-2">
                            <select
                              value={ticket.assignedTo?.email || ''}
                              onChange={(e) => handleAssignTicket(ticket.id, e.target.value)}
                              onClick={(e) => e.stopPropagation()}
                              className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              disabled={(!isProjectManager && creatorIsClient) && ticket.assignedTo?.email === currentUserEmail}
                            >
                              <option value="" disabled>
                                {ticket.assignedTo ? ticket.assignedTo.name : 'Assign...'}
                              </option>
                              {assignable.map(user => (
                                <option key={user.id} value={user.email}>
                                  {user.name || user.email.split('@')[0]}
                                </option>
                              ))}
                            </select>
                            {ticket.assignedTo && (
                              <button
                                type="button"
                                className="ml-2 px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                                onClick={e => {
                                  e.stopPropagation();
                                  handleUnassignTicket(ticket.id);
                                }}
                              >
                                Unassign
                              </button>
                            )}
                          </div>
                        );
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
      ) : (
        <div className="text-center py-12">
          <BsTicketFill className="mx-auto h-12 w-12 text-gray-400" />
          <h3 className="mt-2 text-sm font-medium text-gray-900">No tickets found</h3>
          <p className="mt-1 text-sm text-gray-500">
            Get started by creating a new ticket.
          </p>
          <div className="mt-6">
            <button
              onClick={() => setActiveTab('create')}
              className="inline-flex items-center px-4 py-2 border border-transparent shadow-sm text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
            >
              <BsFolderFill className="mr-2" />
              Create New Ticket
            </button>
          </div>
        </div>
      )}
    </>
  );
};

ProjectManagerTickets.propTypes = {
  setActiveTab: PropTypes.func,
  selectedProjectId: PropTypes.string,
  allProjectIds: PropTypes.array
};

export default ProjectManagerTickets;
 