import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../../firebase/config';
import { Link, useNavigate } from 'react-router-dom';
import { BsTicketFill, BsFolderFill } from 'react-icons/bs';
import TicketDetails from './TicketDetails';
 
const EmployeeTickets = () => {
  const [ticketsData, setTicketsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const navigate = useNavigate();
  const [userProject, setUserProject] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [filterStatus, setFilterStatus] = useState(['All']);
  const [filterPriority, setFilterPriority] = useState(['All']);
  const [filterRaisedByEmployee, setFilterRaisedByEmployee] = useState('all');
  const [filterRaisedByClient, setFilterRaisedByClient] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [currentUserData, setCurrentUserData] = useState(null);
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' for Newest, 'asc' for Oldest
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const priorityDropdownRef = useRef(null);
 
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
        } catch (err) {
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
 
          console.log('Fetched employees:', employeesList);
          console.log('Fetched clients:', clientsList);
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
        }, (err) => {
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
 
  // Filter tickets based on all criteria
  const filteredTickets = ticketsData.filter(ticket => {
    const matchesStatus = filterStatus.includes('All') || filterStatus.includes(ticket.status);
    const matchesPriority = filterPriority.includes('All') || filterPriority.includes(ticket.priority);
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
 
  // Sort tickets by date
  const sortedTickets = [...filteredTickets].sort((a, b) => {
    const dateA = a.created?.toDate ? a.created.toDate() : new Date(a.created);
    const dateB = b.created?.toDate ? b.created.toDate() : new Date(b.created);
    return sortOrder === 'desc' ? dateB - dateA : dateA - dateB;
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
    return <TicketDetails ticketId={selectedTicketId} onBack={handleBackToTickets} />;
  }
 
  return (
    <>
      <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-bold text-gray-900 flex items-center">
            <BsTicketFill className="mr-3 text-blue-600" /> Tickets
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
        {userProject && (
          <p className="text-gray-600 mt-2">Project: {userProject}</p>
        )}
      </div>
 
      <div className="flex justify-between items-center mb-8">
        <Link
          to="/employeedashboard?tab=create"
          className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center"
        >
          <BsFolderFill className="mr-2" />
          Create New Ticket
        </Link>
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
                    Last Updated
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Assigned To
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
                      {ticket.lastUpdated ? new Date(ticket.lastUpdated.toDate()).toLocaleString() : 'N/A'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-'}
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
 
export default EmployeeTickets;