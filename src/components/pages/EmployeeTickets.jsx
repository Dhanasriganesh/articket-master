import { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { BsTicketFill, BsFolderFill } from 'react-icons/bs';
import TicketDetails from './TicketDetails';
import PropTypes from 'prop-types';

const EmployeeTickets = ({ setActiveTab }) => {
  const [ticketsData, setTicketsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [userProject, setUserProject] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [filterRaisedByEmployee, setFilterRaisedByEmployee] = useState('all');
  const [filterRaisedByClient, setFilterRaisedByClient] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserData, setCurrentUserData] = useState(null);

  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async user => {
      if (user) {
        setLoading(true);
        setCurrentUserEmail(user.email);
        let currentProject = 'General';
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            currentProject = userData.project || 'General';
            setUserProject(currentProject);
            setCurrentUserData(userData);
          } else {
            setUserProject('General');
          }
        } catch (error) {
          console.error('Error loading user project:', error);
          setError('Failed to load user project.');
          setUserProject('General');
        }

        // Fetch employees and clients separately
        try {
          const usersRef = collection(db, 'users');
         
          // Fetch employees
          const employeesQuery = query(
            usersRef,
            where('project', '==', currentProject),
            where('role', '==', 'employee')
          );
          const employeesSnapshot = await getDocs(employeesQuery);
          const employeesList = [];
          const employeeEmails = new Set();
          const employeeNameCounts = {};

          employeesSnapshot.forEach((doc) => {
            const userData = doc.data();
            if (!employeeEmails.has(userData.email)) {
              employeeEmails.add(userData.email);
             
              const displayName = userData.firstName && userData.lastName
                ? `${userData.firstName} ${userData.lastName}`.trim()
                : userData.email.split('@')[0];
             
              employeeNameCounts[displayName] = (employeeNameCounts[displayName] || 0) + 1;
             
              employeesList.push({
                id: doc.id,
                email: userData.email,
                name: displayName
              });
            }
          });

          employeesList.sort((a, b) => a.name.localeCompare(b.name));
          employeesList.forEach(emp => {
            if (employeeNameCounts[emp.name] > 1) {
              const emailPart = emp.email.split('@')[0];
              emp.displayName = `${emp.name} (${emailPart})`;
            } else {
              emp.displayName = emp.name;
            }
          });
          setEmployees(employeesList);

          // Fetch clients
          const clientsQuery = query(
            usersRef,
            where('project', '==', currentProject),
            where('role', '==', 'client')
          );
          const clientsSnapshot = await getDocs(clientsQuery);
          const clientsList = [];
          const clientEmails = new Set();
          const clientNameCounts = {};

          clientsSnapshot.forEach((doc) => {
            const userData = doc.data();
            if (userData.email !== user.email && !clientEmails.has(userData.email)) {
              clientEmails.add(userData.email);
             
              const displayName = userData.firstName && userData.lastName
                ? `${userData.firstName} ${userData.lastName}`.trim()
                : userData.email.split('@')[0];
             
              clientNameCounts[displayName] = (clientNameCounts[displayName] || 0) + 1;
             
              clientsList.push({
                id: doc.id,
                email: userData.email,
                name: displayName
              });
            }
          });

          clientsList.sort((a, b) => a.name.localeCompare(b.name));
          clientsList.forEach(client => {
            if (clientNameCounts[client.name] > 1) {
              const emailPart = client.email.split('@')[0];
              client.displayName = `${client.name} (${emailPart})`;
            } else {
              client.displayName = client.name;
            }
          });
          setClients(clientsList);
        } catch (err) {
          console.error('Error fetching users:', err);
        }

        // Query tickets for the employee's project
        const ticketsCollectionRef = collection(db, 'tickets');
        const q = query(
          ticketsCollectionRef,
          where('project', '==', currentProject)
        );
        const unsubscribeTickets = onSnapshot(q, (snapshot) => {
          const tickets = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
          }));
          setTicketsData(tickets);
          setLoading(false);
        }, (error) => {
          console.error('Error loading tickets:', error);
          setError('Failed to load tickets for your project.');
          setLoading(false);
        });
        return () => unsubscribeTickets();
      } else {
        setLoading(false);
        setTicketsData([]);
        setUserProject(null);
        setEmployees([]);
        setClients([]);
      }
    });
    return () => unsubscribeAuth();
  }, []);

  const handleTicketClick = (ticketId) => {
    setSelectedTicketId(ticketId);
  };

  const handleBackToTickets = () => {
    setSelectedTicketId(null);
  };

  // Filter tickets based on all criteria
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

  const handleAssignTicket = async (ticketId, email) => {
    if (!ticketId || !email) return;
    const ticketRef = doc(db, 'tickets', ticketId);
    const newAssignee = {
      name: email.split('@')[0],
      email: email
    };
    const assignerUsername = currentUserEmail.split('@')[0];
    try {
      await updateDoc(ticketRef, {
        assignedTo: newAssignee,
        assignedBy: assignerUsername,
        lastUpdated: serverTimestamp()
      });
    } catch (err) {
      console.error('Error assigning ticket:', err);
    }
  };

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
            <BsTicketFill className="mr-3 text-blue-600" /> Assigned Tickets
          </h1>
          {userProject && (
            <p className="text-gray-600 mt-2">Project: {userProject}</p>
          )}
        </div>
        <button
          onClick={() => setActiveTab('create')}
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center"
        >
          <BsFolderFill className="mr-2" />
          Create New Ticket
        </button>
      </div>

      {/* Filters Bar */}
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

      {ticketsData.length > 0 ? (
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
                    Last Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned To
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
                        employees.find(emp => emp.email === ticket.email)?.name ||
                        clients.find(client => client.email === ticket.email)?.name ||
                        ticket.email
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.lastUpdated ? new Date(ticket.lastUpdated.toDate()).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {(() => {
                        const creatorIsClient = clients.some(c => c.email === ticket.email);
                        const isProjectManager = currentUserData?.role === 'project_manager';
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
                              {/* If ticket raised by client and not project manager, only show 'Assign to me' */}
                              {creatorIsClient && !isProjectManager ? (
                                ticket.assignedTo?.email !== currentUserEmail && (
                                  <option value={currentUserEmail}>
                                    Assign to me ({currentUserEmail.split('@')[0]})
                                  </option>
                                )
                              ) : (
                                employees.map(user => (
                                  <option key={user.id} value={user.email}>
                                    {user.email.split('@')[0]}
                                  </option>
                                ))
                              )}
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
            No tickets have been raised for your project yet.
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

EmployeeTickets.propTypes = {
  setActiveTab: PropTypes.func
};

export default EmployeeTickets;