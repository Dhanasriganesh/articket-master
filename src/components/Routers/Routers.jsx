import React, { useEffect } from 'react';
import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Admin from "../pages/Admin";
import ClientDashboard from '../pages/ClientDashboard';
import ClientTickets from '../pages/ClientTickets';
import EmployeeDashboard from '../pages/EmployeeDashboard';
import Login from '../pages/Login';
import AdminTickets from '../pages/AdminTickets';
import PropTypes from 'prop-types';
import Forgot from '../pages/ForgotPassword';
import Projects from "../pages/Projects";
import Ticketing from "../pages/Ticketing";
import ProjectManagerDashboard from "../pages/ProjectManagerDashboard";
import ClientHeadDashboard from "../pages/ClientHeadDashboard";
import EmployeeTickets from "../pages/EmployeeTickets";
import TicketDetailsWrapper from '../pages/TicketDetailsWrapper';
import EmployeeKPIDashboard from '../pages/EmployeeKPIDashboard';
 
import { auth, db } from '../../firebase/config';
import { onAuthStateChanged } from 'firebase/auth';
import { query, collection, where, getDocs, doc, getDoc } from 'firebase/firestore';
 
// Protected Route component
function ProtectedRoute({ children }) {
  const [isAuthenticated, setIsAuthenticated] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
  const location = useLocation();
 
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        setIsAuthenticated(true);
        // Check Firestore user status and existence
        try {
          const userDocRef = doc(db, 'users', user.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (!userDocSnap.exists()) {
            console.log('ProtectedRoute: User document does not exist, signing out.');
            await auth.signOut();
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
          }
          const userData = userDocSnap.data();
          console.log('ProtectedRoute: Firestore user status:', userData.status);
          if (userData.status === 'disabled') {
            console.log('ProtectedRoute: User is disabled, signing out.');
            await auth.signOut();
            setIsAuthenticated(false);
            setIsLoading(false);
            return;
          }
        } catch (err) {
          console.error('ProtectedRoute: Error checking user status in Firestore:', err);
        }
        setIsLoading(false);
      } else {
        setIsAuthenticated(false);
        setIsLoading(false);
      }
    });
 
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (!isAuthenticated) {
    // Redirect to login with intended path
    return <Navigate to={`/login?redirect=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  }
 
  return children;
}
ProtectedRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
// Admin Route component
function AdminRoute({ children }) {
  const [isAdmin, setIsAdmin] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
 
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user is admin in users collection
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', user.email),
          where('role', '==', 'admin')
        );
        const userSnapshot = await getDocs(userQuery);
        setIsAdmin(!userSnapshot.empty);
      } else {
        setIsAdmin(false);
      }
      setIsLoading(false);
    });
 
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (!isAdmin) {
    return <Navigate to="/clientdashboard" replace />;
  }
 
  return children;
}
AdminRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
// Employee Route component
function EmployeeRoute({ children }) {
  const [isEmployee, setIsEmployee] = React.useState(false);
  const [isLoading, setIsLoading] = React.useState(true);
 
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      if (user) {
        // Check if user is employee in users collection
        const userQuery = query(
          collection(db, 'users'),
          where('email', '==', user.email),
          where('role', '==', 'employee')
        );
        const userSnapshot = await getDocs(userQuery);
        setIsEmployee(!userSnapshot.empty);
      } else {
        setIsEmployee(false);
      }
      setIsLoading(false);
    });
 
    return () => unsubscribe();
  }, []);
 
  if (isLoading) {
    return <div>Loading...</div>;
  }
 
  if (!isEmployee) {
    return <Navigate to="/clientdashboard" replace />;
  }
 
  return children;
}
EmployeeRoute.propTypes = {
  children: PropTypes.node.isRequired,
};
 
function Routers() {
  return (
    <Routes>
      <Route path="/" element={<Login />} />
      <Route path="/login" element={<Login />} />
     
      <Route path="/admin" element={<Admin />} />
      <Route path="/admin-tickets" element={<AdminTickets />} />
      <Route path="/clientdashboard" element={<ClientDashboard />} />
      <Route path="/client-tickets" element={<ClientTickets />} />
      <Route path="/employeedashboard" element={<EmployeeDashboard />} />
      <Route path="/employee-tickets" element={<EmployeeTickets />} />
      <Route path="/forgot-password" element={<Forgot />} />
      <Route path="/projects" element={<Projects />} />
      <Route path="/ticketing" element={<Ticketing />} />
      <Route path="/project-manager-dashboard" element={<ProjectManagerDashboard />} />
      <Route path="/client-head-dashboard" element={<ClientHeadDashboard />} />
      <Route path="/tickets/:ticketId" element={<TicketDetailsWrapper />} />
      <Route path="/team/employee/:id" element={
        <ProtectedRoute>
          <EmployeeKPIDashboard />
        </ProtectedRoute>
      } />
    </Routes>
  );
}
 
export default Routers;
 