import React, { useState, useEffect } from 'react';
import { collection, query, where, getDocs, getFirestore, doc, getDoc } from 'firebase/firestore';
import { getAuth } from 'firebase/auth';
import {
  Users,
  Mail,
  Phone,
  Building,
  Calendar,
  Tag,
  Search,
  Filter,
  RefreshCw,
  User
} from 'lucide-react';

const TeamManagement = () => {
  const [teamMembers, setTeamMembers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedProject, setSelectedProject] = useState('All');
  const [selectedRole, setSelectedRole] = useState('All');
  const [projects, setProjects] = useState([]);

  const auth = getAuth();
  const db = getFirestore();

  useEffect(() => {
    const fetchTeamMembers = async () => {
      try {
        const currentUser = auth.currentUser;
        if (!currentUser) return;

        // First get the VMM project
        const projectsRef = collection(db, 'projects');
        const projectQuery = query(projectsRef, where('name', '==', 'VMM'));
        const projectSnapshot = await getDocs(projectQuery);
        
        if (projectSnapshot.empty) {
          setLoading(false);
          return;
        }

        const vmmProject = {
          id: projectSnapshot.docs[0].id,
          ...projectSnapshot.docs[0].data()
        };
        setProjects([vmmProject]);

        // Get all users with role 'employee' and project 'VMM'
        const usersRef = collection(db, 'users');
        const teamQuery = query(
          usersRef,
          where('role', '==', 'employee'),
          where('project', '==', 'VMM')
        );

        const teamSnapshot = await getDocs(teamQuery);
        const teamData = teamSnapshot.docs.map(doc => ({
          id: doc.id,
          ...doc.data()
        }));
        
        setTeamMembers(teamData);
        setLoading(false);
      } catch (error) {
        console.error('Error fetching team members:', error);
        setLoading(false);
      }
    };

    fetchTeamMembers();
  }, [auth, db]);

  const filteredTeamMembers = teamMembers.filter(member => {
    const matchesSearch = 
      `${member.firstName} ${member.lastName}`.toLowerCase().includes(searchTerm.toLowerCase()) ||
      member.email?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesProject = selectedProject === 'All' || member.projectId === selectedProject;
    const matchesRole = selectedRole === 'All' || member.role === selectedRole;

    return matchesSearch && matchesProject && matchesRole;
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <RefreshCw className="w-8 h-8 text-blue-500 animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Search team members..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Project Filter */}
          <select
            value={selectedProject}
            onChange={(e) => setSelectedProject(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="All">All Projects</option>
            {projects.map(project => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>

          {/* Role Filter */}
          <select
            value={selectedRole}
            onChange={(e) => setSelectedRole(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
          >
            <option value="All">All Roles</option>
            <option value="employee">Employee</option>
            <option value="client">Client</option>
            <option value="project_manager">Project Manager</option>
          </select>

          {/* Clear Filters */}
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedProject('All');
              setSelectedRole('All');
            }}
            className="flex items-center justify-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50"
          >
            <Filter className="w-5 h-5 mr-2" />
            Clear Filters
          </button>
        </div>
      </div>

      {/* Team Members Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filteredTeamMembers.map((member) => {
          const project = projects.find(p => p.id === member.projectId);
          return (
            <div key={member.id} className="bg-white rounded-xl shadow-sm border border-gray-200 p-6 hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between">
                <div className="flex items-center space-x-4">
                  <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-blue-600 rounded-full flex items-center justify-center text-white font-medium text-lg">
                    {member.firstName?.[0]}{member.lastName?.[0]}
                  </div>
                  <div>
                    <h3 className="text-lg font-medium text-gray-900">
                      {member.firstName} {member.lastName}
                    </h3>
                    <p className="text-sm text-gray-500">{member.role}</p>
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  member.status === 'active' ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {member.status || 'Active'}
                </span>
              </div>

              <div className="mt-6 space-y-4">
                <div className="flex items-center text-sm text-gray-500">
                  <Mail className="w-4 h-4 mr-2" />
                  {member.email}
                </div>
                {member.phone && (
                  <div className="flex items-center text-sm text-gray-500">
                    <Phone className="w-4 h-4 mr-2" />
                    {member.phone}
                  </div>
                )}
                <div className="flex items-center text-sm text-gray-500">
                  <Building className="w-4 h-4 mr-2" />
                  {project?.name || 'Unassigned'}
                </div>
                {member.joinDate && (
                  <div className="flex items-center text-sm text-gray-500">
                    <Calendar className="w-4 h-4 mr-2" />
                    Joined {new Date(member.joinDate).toLocaleDateString()}
                  </div>
                )}
              </div>

              <div className="mt-6 flex items-center space-x-4">
                <button className="flex-1 bg-blue-50 text-blue-600 hover:bg-blue-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  View Profile
                </button>
                <button className="flex-1 bg-gray-50 text-gray-600 hover:bg-gray-100 px-4 py-2 rounded-lg text-sm font-medium transition-colors">
                  Message
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

export default TeamManagement; 