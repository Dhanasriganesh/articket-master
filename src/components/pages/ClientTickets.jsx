import React, { useState, useEffect } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { Link, useNavigate } from 'react-router-dom';
import { BsTicketFill, BsFolderFill } from 'react-icons/bs';
import TicketDetails from './TicketDetails';
import { sendEmail } from '../../utils/sendEmail';
 
const ClientTickets = ({ setActiveTab }) => {
  const [ticketsData, setTicketsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const [userProject, setUserProject] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [filterStatus, setFilterStatus] = useState('All');
  const [filterPriority, setFilterPriority] = useState('All');
  const [searchTerm, setSearchTerm] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [filterRaisedByEmployee, setFilterRaisedByEmployee] = useState('all');
  const [filterRaisedByClient, setFilterRaisedByClient] = useState('all');
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' for Newest, 'asc' for Oldest
 
  useEffect(() => {
    const unsubscribeAuth = auth.onAuthStateChanged(async user => {
      if (user) {
        console.log('User authenticated in ClientTickets.jsx', user.email);
        setLoading(true);
        setCurrentUserEmail(user.email);
 
        // Check for filter data from dashboard
        try {
          const filterData = sessionStorage.getItem('ticketFilter');
          if (filterData) {
            const parsedFilter = JSON.parse(filterData);
            setFilterStatus(parsedFilter.status);
            setFilterPriority(parsedFilter.priority);
            setFilterRaisedByEmployee(parsedFilter.raisedByEmployee);
            setFilterRaisedByClient(parsedFilter.raisedByClient);
            // Clear the filter data after applying it
            sessionStorage.removeItem('ticketFilter');
          }
        } catch (err) {
          console.error('Error parsing filter data:', err);
        }
 
        let currentProject = 'General';
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const userData = userDocSnap.data();
            currentProject = userData.project || 'General';
            setUserProject(currentProject);
            console.log('Fetched user project:', currentProject);
          } else {
            console.warn('User document not found for uid:', user.uid);
            setUserProject('General');
          }
        } catch (err) {
          console.error('Error fetching user project:', err);
          setError('Failed to load user project.');
          setUserProject('General');
        }
 
        // Fetch employees and clients separately
        try {
          const usersRef = collection(db, 'users');
         
          // Fetch employees and project managers
          const employeesQuery = query(
            usersRef,
            where('project', '==', currentProject),
            where('role', 'in', ['employee', 'manager'])
          );
          const employeesSnapshot = await getDocs(employeesQuery);
          const employeesList = [];
          const employeeEmails = new Set();
          const employeeNameCounts = {};
 
          employeesSnapshot.forEach((doc) => {
            const userData = doc.data();
            if (userData.email !== user.email && !employeeEmails.has(userData.email)) {
              employeeEmails.add(userData.email);
             
              const displayName = userData.firstName && userData.lastName
                ? `${userData.firstName} ${userData.lastName}`.trim()
                : userData.email.split('@')[0];
             
              employeeNameCounts[displayName] = (employeeNameCounts[displayName] || 0) + 1;
             
              employeesList.push({
                id: doc.id,
                email: userData.email,
                name: displayName,
                role: userData.role
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
                name: displayName,
                role: userData.role
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
 
          console.log('Fetched employees:', employeesList);
          console.log('Fetched clients:', clientsList);
        } catch (err) {
          console.error('Error fetching users:', err);
        }
 
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
          console.log(`Fetched tickets for project ${currentProject}:`, tickets);
        }, (err) => {
          console.error('Error fetching project-filtered tickets:', err);
          setError('Failed to load tickets for your project.');
          setLoading(false);
        });
 
        return () => unsubscribeTickets();
 
      } else {
        console.log('No user authenticated in ClientTickets.jsx');
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
 
  // Compute filtered tickets
  const filteredTickets = ticketsData.filter(ticket => {
    const matchesStatus = filterStatus === 'All' || ticket.status === filterStatus;
    const matchesPriority = filterPriority === 'All' || ticket.priority === filterPriority;
    const matchesSearch =
      ticket.subject?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.id?.toLowerCase().includes(searchTerm.toLowerCase());
   
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
 
  // Sort tickets by date
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const dateA = a.created?.toDate ? a.created.toDate() : new Date(a.created);
    const dateB = b.created?.toDate ? b.created.toDate() : new Date(b.created);
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
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
          {userProject && (
            <p className="text-gray-600 mt-2">Project: {userProject}</p>
          )}
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
          <Link
            to="/client-dashboard?tab=create"
            className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center"
          >
            <BsFolderFill className="mr-2" />
            Create New Ticket
          </Link>
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
            <option value="me">Me</option>
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
          Apply Filters
        </button>
        <button
          onClick={() => {
            setFilterStatus('All');
            setFilterPriority('All');
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
                        // Find the user who raised the ticket in the employees array
                        const ticketRaiser = employees.find(emp => emp.email === ticket.email);
                        const ticketRaisedByEmployeeOrManager = ticketRaiser && (ticketRaiser.role === 'employee' || ticketRaiser.role === 'project_manager');
                        const ticketRaisedByEmployee = employees.some(emp => emp.email === ticket.email && emp.role === 'employee');
                        const ticketRaisedByProjectManager = employees.some(emp => emp.email === ticket.email && emp.role === 'project_manager');
                        const ticketRaisedByClient = clients.some(client => client.email === ticket.email);
                        const isClientHead = clients.find(c => c.email === currentUserEmail)?.role === 'client_head';
                        if (ticketRaisedByClient) {
                          // Read-only for client-raised tickets
                          return ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-';
                        }
                        if (ticketRaisedByEmployee || ticketRaisedByProjectManager) {
                          return (
                            <div className="flex items-center gap-2">
                              <select
                                value={ticket.assignedTo?.email || ''}
                                onChange={(e) => handleAssignTicket(ticket.id, e.target.value)}
                                onClick={(e) => e.stopPropagation()}
                                className="border border-gray-200 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-1 focus:ring-blue-500"
                              >
                                <option value="" disabled>
                                  {ticket.assignedTo ? ticket.assignedTo.name : 'Assign...'}
                                </option>
                                {isClientHead ? (
                                  clients.map(user => (
                                    <option key={user.id} value={user.email}>
                                      {user.email.split('@')[0]}
                                    </option>
                                  ))
                                ) : (
                                  ticket.assignedTo?.email !== currentUserEmail && (
                                    <option value={currentUserEmail}>
                                      Assign to me ({currentUserEmail.split('@')[0]})
                                    </option>
                                  )
                                )}
                              </select>
                              {ticket.assignedTo && (ticket.assignedTo.email === currentUserEmail) && (
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
                        }
                        return ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-';
                      })()}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.lastUpdated ? new Date(ticket.lastUpdated.toDate()).toLocaleString() : 'N/A'}
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
 
export default ClientTickets;
 