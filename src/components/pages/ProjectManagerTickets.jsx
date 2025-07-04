import React, { useState, useEffect, useRef } from 'react';
import { collection, query, where, onSnapshot, doc, getDoc, getDocs, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
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
 
const ProjectManagerTickets = ({ setActiveTab, selectedProjectId, selectedProjectName, allProjectIds = [], setViewingTicket }) => {
  const [ticketsData, setTicketsData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [selectedTicketId, setSelectedTicketId] = useState(null);
  const [filterStatus, setFilterStatus] = useState(['All']);
  const [filterPriority, setFilterPriority] = useState(['All']);
  const [searchTerm, setSearchTerm] = useState('');
  const [teamMembers, setTeamMembers] = useState([]);
  const [filterRaisedByEmployee, setFilterRaisedByEmployee] = useState('all');
  const [filterRaisedByClient, setFilterRaisedByClient] = useState('all');
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [projects, setProjects] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [clients, setClients] = useState([]);
  const [currentUserData, setCurrentUserData] = useState(null);
  const [filtersApplied, setFiltersApplied] = useState(false);
  const [sortOrder, setSortOrder] = useState('desc'); // 'desc' for Newest, 'asc' for Oldest
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const statusDropdownRef = useRef(null);
  const priorityDropdownRef = useRef(null);
 
  useEffect(() => {
    // Guard: skip effect if required props are missing
    if (!selectedProjectName || selectedProjectName.trim() === '' || !selectedProjectId || selectedProjectId.trim() === '') {
      console.warn('selectedProjectName or selectedProjectId is empty or undefined, skipping Firestore queries.', { selectedProjectName, selectedProjectId });
      setLoading(false);
      setTicketsData([]);
      setEmployees([]);
      setClients([]);
      return;
    }
    const unsubscribeAuth = auth.onAuthStateChanged(async user => {
      if (user) {
        console.log('User authenticated in ProjectManagerTickets.jsx', user.email);
        setLoading(true);
        setCurrentUserEmail(user.email);
        const userDocRef = doc(db, 'users', user.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setCurrentUserData(userDocSnap.data());
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
 
        // Fetch employees and clients separately, only if selectedProjectName is defined and not empty
        if (selectedProjectName && selectedProjectName.trim() !== '') {
          console.log('selectedProjectName for Firestore queries:', selectedProjectName);
          try {
            const usersRef = collection(db, 'users');
            // Fetch employees for the selected project
            const employeesQuery = query(
              usersRef,
              where('project', '==', selectedProjectName),
              where('role', '==', 'employee')
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
                  name: displayName
                });
              }
            });
 
            // Process employee display names
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
 
            // Fetch clients for the selected project
            const clientsQuery = query(
              usersRef,
              where('project', '==', selectedProjectName),
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
 
            // Process client display names
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
        } else {
          if (selectedProjectName === undefined || selectedProjectName.trim() === '') {
            console.warn('selectedProjectName is empty or undefined, skipping Firestore queries. Value:', selectedProjectName);
          }
        }
 
        // Set up real-time listener for tickets
        const ticketsCollectionRef = collection(db, 'tickets');
        if (selectedProjectId === 'all' && allProjectIds.length > 0) {
          // Firestore 'in' query limit is 10, so batch if needed
          setTicketsData([]); // Clear before accumulating
          let unsubscribes = [];
          const batchSize = 10;
          for (let i = 0; i < allProjectIds.length; i += batchSize) {
            const batchIds = allProjectIds.slice(i, i + batchSize);
            const q = query(
              ticketsCollectionRef,
              where('projectId', 'in', batchIds)
            );
            const unsubscribe = onSnapshot(q, (snapshot) => {
              const tickets = snapshot.docs.map(doc => ({
                id: doc.id,
                ...doc.data()
              }));
              // Accumulate tickets from all batches
              setTicketsData(prev => {
                // Remove any tickets from this batch, then add new
                const filtered = prev.filter(t => !batchIds.includes(t.projectId));
                // Avoid duplicates by id
                const ids = new Set(filtered.map(t => t.id));
                const merged = [...filtered, ...tickets.filter(t => !ids.has(t.id))];
                return merged;
              });
              setLoading(false);
            }, (err) => {
              setError('Failed to load tickets for your projects.');
              setLoading(false);
            });
            unsubscribes.push(unsubscribe);
          }
          return () => unsubscribes.forEach(unsub => unsub());
        } else {
          const q = query(
            ticketsCollectionRef,
            where('projectId', '==', selectedProjectId)
          );
          const unsubscribeTickets = onSnapshot(q, (snapshot) => {
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
        }
      } else {
        console.log('No user authenticated in ProjectManagerTickets.jsx');
        setLoading(false);
        setTicketsData([]);
        setTeamMembers([]);
      }
    });
 
    return () => unsubscribeAuth();
  }, [selectedProjectId, selectedProjectName, allProjectIds]);
 
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
    if (setViewingTicket) setViewingTicket(true);
  };
 
  const handleBackToTickets = () => {
    setSelectedTicketId(null);
    if (setViewingTicket) setViewingTicket(false);
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
        project: selectedProjectName,
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
    const ticketUser = employees.find(emp => emp.email === ticket.email)
      ? 'employee'
      : clients.find(client => client.email === ticket.email)
        ? 'client'
        : null;
 
    if (ticketUser === 'employee') {
      if (filterRaisedByEmployee === 'all') {
        matchesRaisedBy = true;
      } else if (filterRaisedByEmployee === 'me') {
        matchesRaisedBy = ticket.email === currentUserEmail;
      } else {
        const selectedEmployee = employees.find(emp => emp.id === filterRaisedByEmployee);
        matchesRaisedBy = selectedEmployee ? ticket.email === selectedEmployee.email : false;
      }
    } else if (ticketUser === 'client') {
      if (filterRaisedByClient === 'all') {
        matchesRaisedBy = true;
      } else if (filterRaisedByClient === 'me') {
        matchesRaisedBy = ticket.email === currentUserEmail;
      } else {
        const selectedClient = clients.find(client => client.id === filterRaisedByClient);
        matchesRaisedBy = selectedClient ? ticket.email === selectedClient.email : false;
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
        <div className="flex items-center gap-4 w-full">
          <div className="bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-xl px-6 py-4 flex items-center w-full shadow">
            <h1 className="text-3xl font-bold text-white flex items-center">
              <BsTicketFill className="mr-3 text-white" /> Tickets
            </h1>
            {/* Ticket Stats Cards */}
            <div className="flex gap-2 ml-8">
              <div className="bg-white bg-opacity-80 rounded-lg shadow border border-gray-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
                <span className="text-xs text-gray-700">Total</span>
                <span className="text-lg font-bold text-gray-900">{totalTickets}</span>
              </div>
              <div className="bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] rounded-lg shadow border border-orange-100 px-3 py-2 flex flex-col items-center min-w-[70px]">
                <span className="text-xs text-white">Open</span>
                <span className="text-lg font-bold text-white">{openTickets}</span>
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
        {/* {selectedProjectName && (
          <p className="text-gray-700 mt-2">Project: {selectedProjectId === 'all' ? 'All Projects' : selectedProjectName}</p>
        )} */}
      </div>
 
      <div className="flex justify-between items-center mb-8">
        <div>
          <button
            onClick={() => setActiveTab('create')}
            className="bg-gradient-to-r from-[#FFA14A] to-[#FFB86C] hover:from-[#FFB86C] hover:to-[#FFA14A] text-white px-6 py-2 rounded-lg transition-colors duration-200 flex items-center font-semibold shadow"
          >
            <BsFolderFill className="mr-2 text-white" />
            Create New Ticket
          </button>
        </div>
      </div>
 
      {/* Updated Filters Bar */}
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
          className="bg-orange-600 hover:bg-orange-700 text-white px-4 py-2 rounded-lg font-semibold ml-2"
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
          className="ml-auto text-xs text-orange-600 hover:underline px-2 py-1 rounded"
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
                    -
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
                        ticket.status === 'Open' ? 'bg-orange-100 text-orange-800' :
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
                      {ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-'}
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
 
export default ProjectManagerTickets;