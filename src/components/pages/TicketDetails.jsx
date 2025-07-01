import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, collection, query, where, getDocs, runTransaction } from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import {
  ArrowLeft,
  User,
  Tag,
  Clock,
  Hash,
  Info,
  Briefcase,
  Send,
  CheckCircle,
  Paperclip,
  Link,
  Menu,
  LogOut,
  Home,
  FileText,
  MessageSquare,
  FolderOpen,
  X
} from 'lucide-react';
import { sendEmail } from '../../utils/sendEmail';
import { fetchProjectMemberEmails } from '../../utils/emailUtils';
import ReactQuill from 'react-quill';
import 'react-quill/dist/quill.snow.css';
import parse from 'html-react-parser';

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

const priorities = [
  { value: 'Low', label: 'Low' },
  { value: 'Medium', label: 'Medium' },
  { value: 'High', label: 'High' },
];
const categories = [
  { value: 'Incident', label: 'Incident' },
  { value: 'Service', label: 'Service' },
  { value: 'Change', label: 'Change' },
];
const statusOptions = [
  { value: 'Open', label: 'Open' },
  { value: 'On Hold', label: 'On Hold' },
  { value: 'In Progress', label: 'In Progress' },
  { value: 'Resolved', label: 'Resolved' },
  { value: 'Closed', label: 'Closed' },
];

// Module and Category options (should match Ticketing.jsx)
const moduleOptions = [
  { value: '', label: 'Select Module' },
  { value: 'EWM', label: 'EWM' },
  { value: 'BTP', label: 'BTP' },
  { value: 'TM', label: 'TM' },
  { value: 'Yl', label: 'Yl' },
  { value: 'MFS', label: 'MFS' },
];
const categoryOptionsMap = {
  EWM: [
    { value: 'Inbound', label: 'Inbound' },
    { value: 'Internal', label: 'Internal' },
    { value: 'Outbound', label: 'Outbound' },
  ],
  BTP: [
    { value: 'd', label: 'd' },
    { value: 'e', label: 'e' },
    { value: 'f', label: 'f' },
  ],
  TM: [
    { value: 'g', label: 'g' },
    { value: 'h', label: 'h' },
    { value: 'i', label: 'i' },
  ],
  Yl: [
    { value: 'Gate Management', label: 'Gate Management' },
    { value: 'Yard Dispatching', label: 'Yard Dispatching' },
  ],
  MFS: [
    { value: 'm', label: 'm' },
    { value: 'n', label: 'n' },
    { value: 'o', label: 'o' },
  ],
};

const TicketDetails = ({ ticketId, onBack, onAssign }) => {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newResponse, setNewResponse] = useState('');
  const [isSendingResponse, setIsSendingResponse] = useState(false);
  const [activeTab, setActiveTab] = useState('Commentbox');
  const [currentUserName, setCurrentUserName] = useState('');
  const commentsEndRef = useRef(null);
  // Add state for editing fields
  const [editFields, setEditFields] = useState({ priority: '', status: '', category: '' });
  const [isSaving, setIsSaving] = useState(false);
  const [resolutionText, setResolutionText] = useState('');
  const [resolutionStatus, setResolutionStatus] = useState('');
  const [isSavingResolution, setIsSavingResolution] = useState(false);
  const [commentAttachments, setCommentAttachments] = useState([]);
  const [resolutionAttachments, setResolutionAttachments] = useState([]);
  const [employees, setEmployees] = useState([]);
  const [selectedAssignee, setSelectedAssignee] = useState('');
  const [currentUserRole, setCurrentUserRole] = useState('');
  const [isEditMode, setIsEditMode] = useState(false);
  const [editingCommentIndex, setEditingCommentIndex] = useState(null);
  const [editingCommentValue, setEditingCommentValue] = useState('');
  const [isSavingCommentEdit, setIsSavingCommentEdit] = useState(false);
  const [detailsError, setDetailsError] = useState('');
  const [toast, setToast] = useState({ show: false, message: '', type: 'error' });
  const [currentUserEmail, setCurrentUserEmail] = useState('');
  const [clientMembers, setClientMembers] = useState([]);
  const [selectedRequester, setSelectedRequester] = useState('');
  const [editModule, setEditModule] = useState('');
  const [editCategory, setEditCategory] = useState('');
  const [editSubCategory, setEditSubCategory] = useState('');
  const [editTypeOfIssue, setEditTypeOfIssue] = useState('');
  const [previewImageSrc, setPreviewImageSrc] = useState(null);

  // Toast helper
  const showToast = (message, type = 'error') => {
    setToast({ show: true, message, type });
    setTimeout(() => setToast({ show: false, message: '', type }), 2500);
  };

  // Helper to render Quill HTML with image preview overlays
  const renderQuillWithPreview = (html) => {
    return parse(html, {
      replace: domNode => {
        if (domNode.name === 'img' && domNode.attribs && domNode.attribs.src) {
          return (
            <img
              {...domNode.attribs}
              style={{ maxWidth: 40, maxHeight: 40, width: 40, height: 40, objectFit: 'cover', borderRadius: '0.5rem', cursor: 'pointer', display: 'inline-block', verticalAlign: 'middle', margin: '0 4px', border: '2px solid #d1d5db' }}
              onClick={() => setPreviewImageSrc(domNode.attribs.src)}
              alt={domNode.attribs.alt || 'image'}
            />
          );
        }
      }
    });
  };

  useEffect(() => {
    const fetchTicketAndUsers = async () => {
      if (!ticketId) {
        setError('No ticket ID provided.');
        setLoading(false);
        return;
      }
      setLoading(true);
      try {
        // Fetch ticket details
        const ticketRef = doc(db, 'tickets', ticketId);
        const ticketSnap = await getDoc(ticketRef);
        if (!ticketSnap.exists()) {
          setError('Ticket not found.');
          setLoading(false);
          return;
        }
        const ticketData = { id: ticketSnap.id, ...ticketSnap.data() };
        // Merge old responses for display if comments array is missing
        let comments = [];
        if (ticketData.comments && Array.isArray(ticketData.comments)) {
          comments = ticketData.comments;
        } else {
          // Migrate old responses for display only
          if (ticketData.adminResponses) {
            comments = comments.concat(ticketData.adminResponses.map(r => ({ ...r, authorRole: 'admin' })));
          }
          if (ticketData.customerResponses) {
            comments = comments.concat(ticketData.customerResponses.map(r => ({ ...r, authorRole: 'customer' })));
          }
        }
        // Sort comments by timestamp
        comments.sort((a, b) => {
          const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
          const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
          return ta - tb;
        });
        setTicket({ ...ticketData, comments });
        // Fetch current user name
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            let name = '';
            if (data.firstName || data.lastName) {
              name = `${data.firstName || ''} ${data.lastName || ''}`.trim();
            }
            if (!name) {
              name = (data.email || currentUser.email || '').split('@')[0];
            }
            setCurrentUserName(name);
          } else {
            setCurrentUserName(currentUser.displayName || (currentUser.email?.split('@')[0] || ''));
          }
        }
      } catch (err) {
        console.error('Error fetching data:', err);
        setError('Failed to load ticket details or users.');
      } finally {
        setLoading(false);
      }
    };
    fetchTicketAndUsers();
  }, [ticketId]);

  // Scroll to bottom when comments change
  useEffect(() => {
    if (commentsEndRef.current) {
      commentsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [ticket?.comments?.length]);

  // Add state for editing fields
  useEffect(() => {
    if (ticket) {
      setEditFields({
        priority: ticket.priority,
        status: ticket.status,
        category: ticket.category,
      });
      setResolutionText(ticket.resolution || '');
      setResolutionStatus(ticket.status || '');
    }
  }, [ticket]);

  useEffect(() => {
    const fetchEmployees = async () => {
      if (!ticket?.project) return;
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('project', '==', ticket.project), where('role', 'in', ['employee', 'project_manager']));
      const snapshot = await getDocs(q);
      const emps = snapshot.docs.map(doc => {
        const data = doc.data();
        let name = '';
        if (data.firstName && data.lastName) {
          name = `${data.firstName} ${data.lastName}`.trim();
        } else if (data.firstName) {
          name = data.firstName;
        } else if (data.lastName) {
          name = data.lastName;
        } else {
          name = data.email.split('@')[0];
        }
        // Add a label for project managers
        if (data.role === 'project_manager') {
          name += ' (Project Manager)';
        }
        return {
          id: doc.id,
          email: data.email,
          name,
          role: data.role
        };
      });
      setEmployees(emps);
    };
    const fetchCurrentUserRole = async () => {
      const currentUser = auth.currentUser;
      if (currentUser) {
        setCurrentUserEmail(currentUser.email);
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          setCurrentUserRole(userDocSnap.data().role);
        }
      }
    };
    if (ticket) {
      fetchEmployees();
      setSelectedAssignee(ticket.assignedTo?.email || '');
      fetchCurrentUserRole();
    }
  }, [ticket]);

  useEffect(() => {
    // Fetch client members for requester dropdown
    const fetchClientMembers = async () => {
      if (!ticket?.project) return;
      const usersRef = collection(db, 'users');
      const q = query(usersRef, where('project', '==', ticket.project), where('role', '==', 'client'));
      const snapshot = await getDocs(q);
      const clients = snapshot.docs.map(doc => {
        const data = doc.data();
        let name = '';
        if (data.firstName && data.lastName) {
          name = `${data.firstName} ${data.lastName}`.trim();
        } else if (data.firstName) {
          name = data.firstName;
        } else if (data.lastName) {
          name = data.lastName;
        } else {
          name = data.email.split('@')[0];
        }
        return { email: data.email, name };
      });
      setClientMembers(clients);
    };
    if (ticket) {
      fetchClientMembers();
      setSelectedRequester(ticket.email || '');
      setEditModule(ticket.module || '');
      setEditCategory(ticket.category || '');
      setEditSubCategory(ticket.subCategory || '');
      setEditTypeOfIssue(ticket.typeOfIssue || '');
    }
  }, [ticket]);

  // Helper to get next ticket number for a category
  const getNextTicketNumber = async (category) => {
    let prefix, counterDocId, startValue;
    if (category === 'Incident') {
      prefix = 'IN';
      counterDocId = 'incident_counter';
      startValue = 100000;
    } else if (category === 'Service') {
      prefix = 'SR';
      counterDocId = 'service_counter';
      startValue = 200000;
    } else if (category === 'Change') {
      prefix = 'CR';
      counterDocId = 'change_counter';
      startValue = 300000;
    } else {
      prefix = 'IN';
      counterDocId = 'incident_counter';
      startValue = 100000;
    }
    const counterRef = doc(db, 'counters', counterDocId);
    const nextNumber = await runTransaction(db, async (transaction) => {
      const counterDoc = await transaction.get(counterRef);
      let current = startValue - 1;
      if (counterDoc.exists()) {
        current = counterDoc.data().value;
      }
      const newValue = current + 1;
      transaction.set(counterRef, { value: newValue });
      return newValue;
    });
    return `${prefix}${nextNumber}`;
  };

  // Helper to convert files to base64
  const fileToBase64 = file => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type,
      size: file.size,
      data: reader.result
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });

  const handleCommentAttachmentChange = async (e) => {
    const files = Array.from(e.target.files);
    const base64Files = await Promise.all(files.map(fileToBase64));
    setCommentAttachments(base64Files);
  };

  const handleResolutionAttachmentChange = async (e) => {
    const files = Array.from(e.target.files);
    const base64Files = await Promise.all(files.map(fileToBase64));
    setResolutionAttachments(base64Files);
  };

  const handleAssignChange = (e) => {
    setSelectedAssignee(e.target.value);
  };

  // Modified status dropdown handler
  const handleStatusChange = (e) => {
    const newStatus = e.target.value;
    if ((newStatus === 'Resolved' || newStatus === 'Closed') && !resolutionText.trim()) {
      setActiveTab('Resolution');
      showToast('Please fill the resolution in resolution section', 'error');
      return; // Do not update the field
    }
    setEditFields(f => ({ ...f, status: newStatus }));
  };

  // Handler for saving edits
  const handleSaveDetails = async () => {
    if (!ticket) return;
    setDetailsError('');
    setIsSaving(true);
    try {
      const ticketRef = doc(db, 'tickets', ticket.id);
      let updates = {};
      let commentMsg = [];
      // Priority
      if (editFields.priority !== ticket.priority) {
        updates.priority = editFields.priority;
        commentMsg.push(`Priority changed to ${editFields.priority}`);
      }
      // Status
      if (editFields.status !== ticket.status) {
        updates.status = editFields.status;
        commentMsg.push(`Status changed to ${editFields.status}`);
      }
      // Category (and ticket number)
      if (editFields.category !== ticket.category) {
        updates.category = editFields.category;
        const newTicketNumber = await getNextTicketNumber(editFields.category);
        updates.ticketNumber = newTicketNumber;
        commentMsg.push(`Category changed to ${editFields.category} and Ticket ID updated to ${newTicketNumber}`);
      }
      // Assignment
      let assignee = null;
      if (selectedAssignee && (!ticket.assignedTo || ticket.assignedTo.email !== selectedAssignee)) {
        assignee = employees.find(emp => emp.email === selectedAssignee);
        if (!assignee && selectedAssignee === currentUserEmail) {
          const currentUser = auth.currentUser;
          if (currentUser) {
            const userDocRef = doc(db, 'users', currentUser.uid);
            const userDocSnap = await getDoc(userDocRef);
            if (userDocSnap.exists()) {
              const data = userDocSnap.data();
              let name = '';
              if (data.firstName && data.lastName) {
                name = `${data.firstName} ${data.lastName}`.trim();
              } else if (data.firstName) {
                name = data.firstName;
              } else if (data.lastName) {
                name = data.lastName;
              } else {
                name = data.email.split('@')[0];
              }
              assignee = {
                email: data.email,
                name,
                role: data.role || 'project_manager',
              };
            }
          }
        }
        if (assignee) {
          updates.assignedTo = { email: assignee.email, name: assignee.name, role: assignee.role };
          commentMsg.push(`Assigned to ${assignee.name}`);
        }
      }
      // If only the assignee changed, call handleAssignTicket and do not send a comment email
      const onlyAssigneeChanged = (
        Object.keys(updates).length === 1 && updates.assignedTo
      );
      if (onlyAssigneeChanged) {
        await onAssign(ticket.id, updates.assignedTo.email);
        setIsSaving(false);
        return;
      }
      // Module, Category, Sub-Category, Type of Issue, Requester
      if (editModule !== ticket.module) {
        updates.module = editModule;
      }
      if (editCategory !== ticket.category) {
        updates.category = editCategory;
      }
      if (editSubCategory !== ticket.subCategory) {
        updates.subCategory = editSubCategory;
      }
      if (editTypeOfIssue !== ticket.typeOfIssue) {
        updates.typeOfIssue = editTypeOfIssue;
      }
      if (selectedRequester !== ticket.email) {
        updates.email = selectedRequester;
        // Optionally update customer name if you want:
        const req = clientMembers.find(c => c.email === selectedRequester);
        if (req) updates.customer = req.name;
      }
      if (Object.keys(updates).length > 0) {
        updates.lastUpdated = serverTimestamp();
        await updateDoc(ticketRef, updates);
        // Add comment
        const currentUser = auth.currentUser;
        let authorName = currentUserName;
        if (!authorName) authorName = currentUser?.displayName || (currentUser?.email?.split('@')[0] || '');
        const comment = {
          message: commentMsg.join('; '),
          timestamp: new Date(),
          authorEmail: currentUser?.email,
          authorName,
          authorRole: 'user',
        };
        await updateDoc(ticketRef, { comments: arrayUnion(comment) });
        // Refresh ticket
        const updatedTicketSnap = await getDoc(ticketRef);
        if (updatedTicketSnap.exists()) {
          const ticketData = { id: updatedTicketSnap.id, ...updatedTicketSnap.data() };
          let comments = ticketData.comments || [];
          comments.sort((a, b) => {
            const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
            const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
            return ta - tb;
          });
          setTicket({ ...ticketData, comments });
        }
        // Send email to the client who raised the ticket (for comment)
        if (ticket && ticket.email) {
          const recipients = [ticket.email];
          if (ticket.assignedTo && ticket.assignedTo.email && ticket.assignedTo.email !== ticket.email) {
            recipients.push(ticket.assignedTo.email);
          }
          const emailParams = {
            to_email: recipients.join(','),
            to_name: ticket.customer || ticket.name || ticket.email,
            subject: `New update on Ticket ID: ${ticket.ticketNumber}`,
            ticket_number: ticket.ticketNumber,
            message: commentMsg.join('; '),
            is_comment: true,
            assigned_by_name: currentUserName,
            assigned_by_email: currentUser.email,
            ticket_link: `https://articket.vercel.app/tickets/${ticket.id}`,
          };
          await sendEmail(emailParams, 'template_6265t8d');
        }
      }
    } catch (err) {
      console.error('Error saving details:', err);
    } finally {
      setIsSaving(false);
    }
  };

  const handleAddResponse = async () => {
    if (!newResponse.trim() || !ticketId || !auth.currentUser) return;
    setIsSendingResponse(true);
    try {
      const ticketRef = doc(db, 'tickets', ticketId);
      const currentUser = auth.currentUser;
      // Get user name
      let authorName = currentUserName;
      if (!authorName) {
        const userDocRef = doc(db, 'users', currentUser.uid);
        const userDocSnap = await getDoc(userDocRef);
        if (userDocSnap.exists()) {
          const data = userDocSnap.data();
          authorName = data.firstName || data.lastName ? `${data.firstName || ''} ${data.lastName || ''}`.trim() : (data.email || currentUser.email || '').split('@')[0];
        } else {
          authorName = currentUser.displayName || (currentUser.email?.split('@')[0] || '');
        }
      }
      const comment = {
        message: newResponse.trim(),
        timestamp: new Date(),
        authorEmail: currentUser.email,
        authorName,
        authorRole: 'user',
        attachments: commentAttachments
      };
      await updateDoc(ticketRef, {
        comments: arrayUnion(comment),
        lastUpdated: serverTimestamp()
      });
      setNewResponse('');
      setCommentAttachments([]);
      // Send email to the client who raised the ticket (for comment)
      if (ticket && ticket.email) {
        const recipients = [ticket.email];
        if (ticket.assignedTo && ticket.assignedTo.email && ticket.assignedTo.email !== ticket.email) {
          recipients.push(ticket.assignedTo.email);
        }
        const emailParams = {
          to_email: recipients.join(','),
          to_name: ticket.customer || ticket.name || ticket.email,
          subject: `New update on Ticket ID: ${ticket.ticketNumber}`,
          ticket_number: ticket.ticketNumber,
          message: newResponse.trim(),
          is_comment: true,
          assigned_by_name: currentUserName,
          assigned_by_email: currentUser.email,
          ticket_link: `https://articket.vercel.app/tickets/${ticket.id}`,
        };
        await sendEmail(emailParams, 'template_6265t8d');
      }
      // Re-fetch ticket to update UI
      const updatedTicketSnap = await getDoc(ticketRef);
      if (updatedTicketSnap.exists()) {
        const ticketData = { id: updatedTicketSnap.id, ...updatedTicketSnap.data() };
        let comments = ticketData.comments || [];
        comments.sort((a, b) => {
          const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
          const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
          return ta - tb;
        });
        setTicket({ ...ticketData, comments });
      }
    } catch (err) {
      console.error('Error adding comment:', err);
    } finally {
      setIsSendingResponse(false);
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'Open':
        return 'bg-blue-100 text-blue-800';
      case 'In Progress':
        return 'bg-yellow-100 text-yellow-800';
      case 'Resolved':
        return 'bg-green-100 text-green-800';
      case 'Closed':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleSaveResolution = async () => {
    if (!ticket) return;
    setIsSavingResolution(true);
    try {
      const ticketRef = doc(db, 'tickets', ticket.id);
      const currentUser = auth.currentUser;
      let authorName = currentUserName;
      if (!authorName) authorName = currentUser?.displayName || (currentUser?.email?.split('@')[0] || '');
      await updateDoc(ticketRef, {
        resolution: resolutionText,
        status: resolutionStatus,
        lastUpdated: serverTimestamp(),
        resolutionAttachments: resolutionAttachments,
        comments: arrayUnion({
          message: `Resolution updated by ${authorName}:\n${resolutionText}`,
          timestamp: new Date(),
          authorEmail: currentUser?.email,
          authorName,
          authorRole: 'resolver',
          attachments: resolutionAttachments
        })
      });
      // Refresh ticket
      const updatedTicketSnap = await getDoc(ticketRef);
      if (updatedTicketSnap.exists()) {
        const ticketData = { id: updatedTicketSnap.id, ...updatedTicketSnap.data() };
        let comments = ticketData.comments || [];
        comments.sort((a, b) => {
          const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
          const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
          return ta - tb;
        });
        setTicket({ ...ticketData, comments });
      }
      setResolutionAttachments([]);
      // Send email to the client who raised the ticket (for resolution)
      if (ticket && ticket.email) {
        const emailParams = {
          to_email: ticket.email,
          to_name: ticket.customer || ticket.name || ticket.email,
          subject: `Resolution provided for Ticket ID: ${ticket.ticketNumber}`,
          ticket_number: ticket.ticketNumber,
          message: resolutionText,
          is_resolution: true,
          assigned_by_name: currentUserName,
          assigned_by_email: currentUser.email,
          ticket_link: `https://articket.vercel.app/tickets/${ticket.id}`,
        };
        await sendEmail(emailParams, 'template_6265t8d');
      }
    } catch (err) {
      console.error('Error saving resolution:', err);
    } finally {
      setIsSavingResolution(false);
    }
  };

  // Add a function to reset edit fields
  const resetEditFields = () => {
    if (ticket) {
      setEditFields({
        priority: ticket.priority,
        status: ticket.status,
        category: ticket.category,
      });
      setSelectedAssignee(ticket.assignedTo?.email || '');
    }
  };

  // Edit comment handler
  const handleEditComment = (index, message) => {
    setEditingCommentIndex(index);
    setEditingCommentValue(message);
  };
  const handleCancelEditComment = () => {
    setEditingCommentIndex(null);
    setEditingCommentValue('');
  };
  const handleSaveEditComment = async (comment, index) => {
    if (!ticket) return;
    setIsSavingCommentEdit(true);
    try {
      const ticketRef = doc(db, 'tickets', ticket.id);
      // Prepare new comments array
      const updatedComments = [...ticket.comments];
      updatedComments[index] = {
        ...comment,
        message: editingCommentValue,
        lastEditedAt: new Date(),
        lastEditedBy: currentUserName,
      };
      await updateDoc(ticketRef, { comments: updatedComments });
      // Refresh ticket
      const updatedTicketSnap = await getDoc(ticketRef);
      if (updatedTicketSnap.exists()) {
        const ticketData = { id: updatedTicketSnap.id, ...updatedTicketSnap.data() };
        let comments = ticketData.comments || [];
        comments.sort((a, b) => {
          const ta = a.timestamp?.seconds ? a.timestamp.seconds : (a.timestamp?._seconds || new Date(a.timestamp).getTime()/1000 || 0);
          const tb = b.timestamp?.seconds ? b.timestamp.seconds : (b.timestamp?._seconds || new Date(b.timestamp).getTime()/1000 || 0);
          return ta - tb;
        });
        setTicket({ ...ticketData, comments });
      }
      setEditingCommentIndex(null);
      setEditingCommentValue('');
    } catch (err) {
      console.error('Error editing comment:', err);
    } finally {
      setIsSavingCommentEdit(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Loading ticket details...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded max-w-md">
          <strong className="font-bold">Error: </strong>
          <span className="block sm:inline">{error}</span>
          <button
            onClick={onBack}
            className="ml-4 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-red-700 bg-red-200 hover:bg-red-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  if (!ticket) {
    return (
      <div className="flex items-center justify-center p-4">
        <div className="bg-yellow-100 border border-yellow-400 text-yellow-700 px-4 py-3 rounded max-w-md">
          <strong className="font-bold">Information: </strong>
          <span className="block sm:inline">Ticket data is not available.</span>
          <button
            onClick={onBack}
            className="ml-4 inline-flex items-center px-3 py-1.5 border border-transparent text-sm font-medium rounded-md text-yellow-700 bg-yellow-200 hover:bg-yellow-300 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-yellow-500"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const mainContent = (
    <div className="flex flex-col gap-8 lg:flex-row">
      {/* Toast */}
      {toast.show && (
        <div className={`fixed top-6 left-1/2 transform -translate-x-1/2 p-4 rounded-xl shadow-lg transition-all duration-300 z-[9999] ${toast.type === 'success' ? 'bg-green-600' : 'bg-red-600'}`}
        >
          <div className="flex items-center space-x-2 text-white">
            <span>{toast.message}</span>
          </div>
        </div>
      )}
      {/* Main Content */}
      <div className="flex-1 min-w-0">
        {/* Go Back Button */}
        <div className="mb-2 flex items-center">
          <button
            onClick={onBack}
            className="inline-flex items-center px-4 py-2 text-sm font-medium rounded-md text-blue-700 bg-blue-100 hover:bg-blue-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 shadow"
          >
            <ArrowLeft className="w-4 h-4 mr-2" />
            Go Back
          </button>
        </div>
        {/* Ticket Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6 px-2">
          <div>
            <div className="text-2xl font-bold text-gray-900">{ticket.subject || 'No Subject'}</div>
            <div className="text-gray-500 text-sm mt-1">Ticket ID: <span className="font-mono">{ticket.ticketNumber}</span></div>
          </div>
        </div>
        {/* Tabs */}
        <div className="border-b mb-8 px-2">
          <nav className="flex flex-wrap gap-2">
            {['Details','Commentbox','Resolution','Time Elapsed Analysis'].map(tab => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`px-5 py-2 text-sm font-semibold rounded-t-lg border-b-2 transition-all duration-150 focus:outline-none ${activeTab === tab ? 'border-blue-600 text-blue-700 bg-white shadow-sm' : 'border-transparent text-gray-500 hover:text-blue-600 hover:bg-blue-50'}`}
                style={{marginBottom: activeTab === tab ? '-2px' : 0}}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>
        {/* Tab Content */}
        <div className="px-2 pb-2 sm:px-1 xs:px-0">
          {activeTab === 'Commentbox' && (
            <>
              {/* Comments List */}
              <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 shadow-sm mb-10 max-h-96 overflow-y-auto">
                <div className="mb-4 text-base text-gray-700 font-semibold">Comment Box</div>
                <div className="space-y-6">
                  {ticket.comments && ticket.comments.length > 0 ? (
                    ticket.comments.map((comment, index) => {
                      const isEditing = editingCommentIndex === index;
                      return (
                      <div key={index} className="flex items-start gap-4">
                        <div className="flex-shrink-0 w-10 h-10 rounded-full bg-blue-200 flex items-center justify-center font-bold text-blue-700 text-lg shadow-sm">
                          {comment.authorName ? comment.authorName.charAt(0).toUpperCase() : (comment.authorEmail ? comment.authorEmail.charAt(0).toUpperCase() : '?')}
                        </div>
                        <div className="flex-1">
                          <div className="bg-white border border-blue-100 rounded-xl p-4 shadow-sm">
                            <div className="flex items-center justify-between mb-1">
                              <span className="font-semibold text-blue-700">{comment.authorName || comment.authorEmail}</span>
                              <span className="text-xs text-gray-400">{formatTimestamp(comment.timestamp)}</span>
                            </div>
                              {isEditing ? (
                                <>
                                  <textarea
                                    className="w-full border border-gray-300 rounded p-2 mb-2"
                                    value={editingCommentValue}
                                    onChange={e => setEditingCommentValue(e.target.value)}
                                    rows={3}
                                  />
                                  <div className="flex gap-2 justify-end">
                                    <button
                                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-1.5 rounded font-semibold"
                                      onClick={() => handleSaveEditComment(comment, index)}
                                      disabled={isSavingCommentEdit || !editingCommentValue.trim()}
                                    >
                                      {isSavingCommentEdit ? 'Saving...' : 'Save'}
                                    </button>
                                    <button
                                      className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-4 py-1.5 rounded font-semibold"
                                      onClick={handleCancelEditComment}
                                      disabled={isSavingCommentEdit}
                                    >
                                      Cancel
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                            <div className="text-gray-900 whitespace-pre-wrap leading-relaxed">{comment.message ? renderQuillWithPreview(comment.message) : null}</div>
                                  {comment.lastEditedAt && comment.lastEditedBy && (
                                    <div className="mt-1 text-xs text-gray-500 italic">Last edited by {comment.lastEditedBy} at {formatTimestamp(comment.lastEditedAt)}</div>
                                  )}
                                  <button
                                    className="text-blue-600 hover:underline text-xs mt-2"
                                    onClick={() => handleEditComment(index, comment.message)}
                                  >
                                    Edit
                                  </button>
                                </>
                              )}
                            {comment.attachments && comment.attachments.length > 0 && (
                              <div className="flex flex-wrap gap-2 mt-2">
                                {comment.attachments.map((file, idx) => (
                                  <div key={idx} className="flex flex-col items-center border rounded p-1 bg-gray-50">
                                    {file.type.startsWith('image/') ? (
                                      <a href={file.data} target="_blank" rel="noopener noreferrer">
                                        <img src={file.data} alt={file.name} className="w-16 h-16 object-cover rounded mb-1" />
                                      </a>
                                    ) : file.type === 'application/pdf' ? (
                                      <a href={file.data} target="_blank" rel="noopener noreferrer" className="text-red-600 underline">PDF: {file.name}</a>
                                    ) : file.type.startsWith('video/') ? (
                                      <video src={file.data} controls className="w-16 h-16 mb-1" />
                                    ) : (
                                      <a href={file.data} download={file.name} className="text-gray-600 underline">{file.name}</a>
                                    )}
                                  </div>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                      );
                    })
                  ) : (
                    <div className="text-gray-400 text-center py-12">No comments yet.</div>
                  )}
                  <div ref={commentsEndRef} />
                </div>
              </div>
              {/* Add Comment Section */}
              <div className="bg-white rounded-2xl p-8 shadow border border-gray-100">
                <h3 className="text-lg font-semibold text-gray-900 mb-4">Add a comment</h3>
                <div className="flex flex-col space-y-4">
                  <ReactQuill
                    value={newResponse}
                    onChange={setNewResponse}
                    modules={{
                      toolbar: [
                        [{ 'header': [1, 2, false] }],
                        ['bold', 'italic', 'underline', 'strike'],
                        [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                        ['link', 'image'],
                        ['clean']
                      ]
                    }}
                    formats={['header', 'bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'link', 'image']}
                    className="bg-white rounded-xl border-2 border-gray-200 focus:border-blue-500 min-h-[120px]"
                    placeholder="Add a comment... (You can paste screenshots directly here)"
                  />
                  {/* Render preview thumbnails for images in the comment */}
                  {newResponse && (
                    <div className="mt-2 prose prose-sm max-w-none">
                      {renderQuillWithPreview(newResponse)}
                    </div>
                  )}
                  <input
                    id="comment-attachment-input"
                    type="file"
                    multiple
                    accept="image/*,application/pdf,video/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                    onChange={handleCommentAttachmentChange}
                    className="hidden"
                  />
                  <label htmlFor="comment-attachment-input" className="inline-flex items-center cursor-pointer text-blue-600 hover:text-blue-800 mb-2">
                    <Paperclip className="w-5 h-5 mr-1" />
                    <span>Choose file(s)</span>
                  </label>
                  {/* Preview selected attachments */}
                  {commentAttachments.length > 0 && (
                    <div className="flex flex-wrap gap-4 mb-2">
                      {commentAttachments.map((file, idx) => (
                        <div key={idx} className="flex flex-col items-center border rounded p-2 bg-gray-50">
                          {file.type.startsWith('image/') ? (
                            <img src={file.data} alt={file.name} className="w-16 h-16 object-cover rounded mb-1" />
                          ) : file.type === 'application/pdf' ? (
                            <span className="text-red-600">PDF: {file.name}</span>
                          ) : file.type.startsWith('video/') ? (
                            <video src={file.data} controls className="w-16 h-16 mb-1" />
                          ) : (
                            <span className="text-gray-600">{file.name}</span>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={handleAddResponse}
                      disabled={!newResponse.trim() || isSendingResponse}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-8 py-3 rounded-xl transition-all duration-200 flex items-center justify-center disabled:opacity-50 disabled:cursor-not-allowed font-semibold shadow"
                    >
                      {isSendingResponse ? (
                        <>
                          <svg className="animate-spin h-4 w-4 text-white mr-2" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                          </svg>
                          <span>Sending...</span>
                        </>
                      ) : (
                        <>
                          <Send className="h-4 w-4 mr-2" />
                          <span>comment</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </>
          )}
          {activeTab === 'Details' && (
            <div className="space-y-8">
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                <div className="flex justify-between items-start mb-6">
                  <div className="text-lg font-semibold text-gray-800">Ticket Details</div>
                  {!isEditMode ? (
                    <button
                      className="text-blue-600 hover:text-blue-800 text-sm font-medium border border-blue-100 rounded px-4 py-1.5 transition"
                      onClick={() => setIsEditMode(true)}
                    >
                      Edit
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div><span className="font-semibold text-gray-700">Request ID:</span> {ticket.ticketNumber}</div>
                  <div>
                    <span className="font-semibold text-gray-700">Status:</span>
                    {isEditMode ? (
                    <select
                      className="ml-2 border border-gray-300 rounded px-2 py-1"
                      value={editFields.status}
                      onChange={handleStatusChange}
                      disabled={isSaving}
                    >
                      {statusOptions.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    ) : (
                      <span className="ml-2">{editFields.status}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Priority:</span>
                    {isEditMode ? (
                    <select
                      className="ml-2 border border-gray-300 rounded px-2 py-1"
                      value={editFields.priority}
                      onChange={e => setEditFields(f => ({ ...f, priority: e.target.value }))}
                      disabled={isSaving}
                    >
                      {priorities.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                    ) : (
                      <span className="ml-2">{editFields.priority}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Module:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={editModule}
                        onChange={e => {
                          setEditModule(e.target.value);
                          setEditCategory('');
                        }}
                        disabled={isSaving}
                      >
                        {moduleOptions.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{ticket.module || '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Category:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={editCategory}
                        onChange={e => setEditCategory(e.target.value)}
                        disabled={isSaving || !editModule}
                      >
                        {!editModule && <option value="">Please select the module</option>}
                        {editModule && categoryOptionsMap[editModule]?.map(opt => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{ticket.category || '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Sub-Category:</span>
                    {isEditMode ? (
                      <input
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={editSubCategory}
                        onChange={e => setEditSubCategory(e.target.value)}
                        disabled={isSaving}
                        placeholder="Enter sub-category (if any)"
                      />
                    ) : (
                      <span className="ml-2">{ticket.subCategory || '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Type of Issue:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={editTypeOfIssue}
                        onChange={e => setEditTypeOfIssue(e.target.value)}
                        disabled={isSaving}
                      >
                        <option value="">Select Type of Issue</option>
                        {categories.map(category => (
                          <option key={category.value} value={category.value}>{category.value}</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{ticket.typeOfIssue || '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Assigned To:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={selectedAssignee}
                        onChange={handleAssignChange}
                        disabled={isSaving || employees.length === 0}
                      >
                        <option value="">Unassigned</option>
                        {currentUserEmail && !employees.some(emp => emp.email === currentUserEmail) && (
                          <option value={currentUserEmail}>Assign to Me</option>
                        )}
                        {employees.map(emp => (
                          <option key={emp.email} value={emp.email}>{emp.name} ({emp.role})</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-'}</span>
                    )}
                  </div>
                  <div>
                    <span className="font-semibold text-gray-700">Requester:</span>
                    {isEditMode ? (
                      <select
                        className="ml-2 border border-gray-300 rounded px-2 py-1"
                        value={selectedRequester}
                        onChange={e => setSelectedRequester(e.target.value)}
                        disabled={isSaving || clientMembers.length === 0}
                      >
                        <option value="">Select Requester</option>
                        {clientMembers.map(client => (
                          <option key={client.email} value={client.email}>{client.name} ({client.email})</option>
                        ))}
                      </select>
                    ) : (
                      <span className="ml-2">{ticket.customer} ({ticket.email})</span>
                    )}
                  </div>
                </div>
                {isEditMode && (
                  <div className="flex justify-end mt-6 gap-2">
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold disabled:opacity-50"
                      onClick={async () => {
                        await handleSaveDetails();
                        setIsEditMode(false);
                      }}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving...' : 'Save Changes'}
                  </button>
                    <button
                      className="bg-gray-200 hover:bg-gray-300 text-gray-800 px-6 py-2 rounded-lg font-semibold"
                      onClick={() => { resetEditFields(); setIsEditMode(false); }}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                </div>
                )}
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                <div className="font-semibold text-gray-700 mb-2">Description</div>
                <div className="whitespace-pre-wrap break-words text-gray-900 border border-gray-100 rounded-lg p-4 bg-gray-50" style={{ fontFamily: 'inherit', fontSize: '1rem', minHeight: '80px' }}>
                  {ticket.description ? renderQuillWithPreview(ticket.description) : <span className="text-gray-400">No description provided.</span>}
                </div>
              </div>
              {ticket.attachments && ticket.attachments.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                  <div className="font-semibold text-gray-700 mb-2">Attachments ({ticket.attachments.length})</div>
                  <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4 overflow-x-auto">
                    {ticket.attachments.map((file, index) => (
                      <div key={index} className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-3 shadow-sm">
                        <span className="text-xs font-medium text-gray-700 text-center truncate w-full" title={file.name}>{file.name}</span>
                        <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        {/* Preview/Download Button */}
                        {file.type.startsWith('image/') ? (
                          <img src={file.data} alt={file.name} className="w-24 h-24 object-contain rounded mb-1 border" />
                        ) : file.type === 'application/pdf' ? (
                          <a
                            href={file.data}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-red-600 hover:text-red-800 text-xs font-medium"
                          >
                            Preview
                          </a>
                        ) : (
                          <a
                            href={file.data}
                            download={file.name}
                            className="text-gray-600 hover:text-gray-800 text-xs font-medium"
                          >
                            Download
                          </a>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
          {activeTab === 'Resolution' && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-6">
              <div className="font-bold text-lg text-gray-900 mb-4">Resolution</div>
              <div className="mb-2 text-gray-700">Explain the problem, steps taken, and how the issue was resolved:</div>
              <ReactQuill
                value={resolutionText}
                onChange={setResolutionText}
                modules={{
                  toolbar: [
                    [{ 'header': [1, 2, false] }],
                    ['bold', 'italic', 'underline', 'strike'],
                    [{ 'list': 'ordered'}, { 'list': 'bullet' }],
                    ['link', 'image'],
                    ['clean']
                  ]
                }}
                formats={['header', 'bold', 'italic', 'underline', 'strike', 'list', 'bullet', 'link', 'image']}
                className="bg-white rounded-xl border-2 border-gray-200 focus:border-blue-500 min-h-[120px]"
                placeholder="Add a resolution... (You can paste screenshots directly here)"
              />
              {/* Render preview thumbnails for images in the resolution */}
              {resolutionText && (
                <div className="mt-2 prose prose-sm max-w-none">
                  {renderQuillWithPreview(resolutionText)}
                </div>
              )}
              <input
                id="resolution-attachment-input"
                type="file"
                multiple
                accept="image/*,application/pdf,video/*,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt"
                onChange={handleResolutionAttachmentChange}
                className="hidden"
              />
              <label htmlFor="resolution-attachment-input" className="inline-flex items-center cursor-pointer text-blue-600 hover:text-blue-800 mb-2">
                <Paperclip className="w-5 h-5 mr-1" />
                <span>Choose file(s)</span>
              </label>
              <div className="flex flex-col sm:flex-row gap-4 items-center">
                <button
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-semibold disabled:opacity-50"
                  onClick={handleSaveResolution}
                  disabled={isSavingResolution || !resolutionText.trim() || !resolutionStatus}
                >
                  {isSavingResolution ? 'Saving...' : 'Submit'}
                </button>
              </div>
              {ticket.resolution && (
                <div className="mt-4 text-gray-600 text-sm">
                  <span className="font-semibold">Last Resolution:</span> {renderQuillWithPreview(ticket.resolution)}
                </div>
              )}
              {/* Show previous resolution attachments if any */}
              {ticket.resolutionAttachments && ticket.resolutionAttachments.length > 0 && (
                <div className="flex flex-wrap gap-2 mt-2">
                  {ticket.resolutionAttachments.map((file, idx) => (
                    <div key={idx} className="flex flex-col items-center border rounded p-1 bg-gray-50">
                      {file.type.startsWith('image/') ? (
                        <a href={file.data} target="_blank" rel="noopener noreferrer">
                          <img src={file.data} alt={file.name} className="w-16 h-16 object-cover rounded mb-1" />
                        </a>
                      ) : file.type === 'application/pdf' ? (
                        <a href={file.data} target="_blank" rel="noopener noreferrer" className="text-red-600 underline">PDF: {file.name}</a>
                      ) : file.type.startsWith('video/') ? (
                        <video src={file.data} controls className="w-16 h-16 mb-1" />
                      ) : (
                        <a href={file.data} download={file.name} className="text-gray-600 underline">{file.name}</a>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
          {activeTab === 'Time Elapsed Analysis' && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-6">
              <div className="font-bold text-lg text-gray-900 mb-4">Time Elapsed Analysis</div>
              <div className="text-gray-800 mb-2">Sample time breakdown for this ticket:</div>
              <table className="min-w-full text-sm text-left text-gray-700">
                <thead>
                  <tr>
                    <th className="py-2 px-4 font-semibold">Stage</th>
                    <th className="py-2 px-4 font-semibold">Start Time</th>
                    <th className="py-2 px-4 font-semibold">End Time</th>
                    <th className="py-2 px-4 font-semibold">Duration</th>
                  </tr>
                </thead>
                <tbody>
                  <tr className="border-t">
                    <td className="py-2 px-4">Ticket Created</td>
                    <td className="py-2 px-4">2025-06-05 12:15</td>
                    <td className="py-2 px-4">2025-06-05 12:20</td>
                    <td className="py-2 px-4">5 min</td>
                  </tr>
                  <tr className="border-t">
                    <td className="py-2 px-4">Assigned</td>
                    <td className="py-2 px-4">2025-06-05 12:20</td>
                    <td className="py-2 px-4">2025-06-05 13:00</td>
                    <td className="py-2 px-4">40 min</td>
                  </tr>
                  <tr className="border-t">
                    <td className="py-2 px-4">In Progress</td>
                    <td className="py-2 px-4">2025-06-05 13:00</td>
                    <td className="py-2 px-4">2025-06-05 15:30</td>
                    <td className="py-2 px-4">2 hr 30 min</td>
                  </tr>
                  <tr className="border-t">
                    <td className="py-2 px-4">Resolved</td>
                    <td className="py-2 px-4">2025-06-05 15:30</td>
                    <td className="py-2 px-4">2025-06-05 16:00</td>
                    <td className="py-2 px-4">30 min</td>
                  </tr>
                </tbody>
              </table>
              <div className="mt-4 text-blue-700 font-semibold">Total Time: 3 hr 45 min</div>
            </div>
          )}
        </div>
      </div>
      {/* Sidebar */}
      <div className="w-full lg:w-80 space-y-6">
        {/* Fields Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Fields</h3>
          <div className="space-y-4">
            <div>
              <p className="text-sm text-gray-600">Start date</p>
              <p className="text-sm font-medium text-gray-900">
                {ticket.created ? formatTimestamp(ticket.created).split(',')[0] : 'N/A'}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-600">Priority</p>
              <div className="flex items-center space-x-2">
                <span className={`inline-block w-2 h-2 rounded-full ${
                  ticket.priority === 'High' ? 'bg-red-500' :
                  ticket.priority === 'Medium' ? 'bg-yellow-500' :
                  'bg-blue-500'
                }`}></span>
                <p className="text-sm font-medium text-gray-900">{ticket.priority || 'Low'}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600">Project</p>
              <div className="flex items-center space-x-2">
                <div className="w-6 h-6 rounded-full bg-indigo-100 flex items-center justify-center">
                  <FolderOpen className="w-4 h-4 text-indigo-600" />
                </div>
                <p className="text-sm font-medium text-gray-900">{ticket.project || 'General'}</p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600">Reporter</p>
              <div className="flex items-center space-x-2 mt-1">
                <div className="w-6 h-6 rounded-full bg-blue-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-blue-600" />
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {ticket.customer || ticket.email?.split('@')[0] || 'N/A'}
                </p>
              </div>
            </div>
            <div>
              <p className="text-sm text-gray-600">Assignee</p>
              <div className="flex items-center space-x-2 mt-1">
                <div className="w-6 h-6 rounded-full bg-purple-100 flex items-center justify-center">
                  <User className="w-4 h-4 text-purple-600" />
                </div>
                <p className="text-sm font-medium text-gray-900">
                  {ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email?.split('@')[0]) : 'Unassigned'}
                </p>
              </div>
            </div>
          </div>
        </div>
        {/* Attachments Card */}
        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
          <h3 className="text-lg font-semibold text-gray-900 mb-4">Attachments</h3>
          <div className="space-y-3">
            {ticket.attachments && ticket.attachments.length > 0 ? (
              ticket.attachments.map((file, index) => (
                <div key={index} className="flex items-start space-x-3">
                  <div className="flex-shrink-0">
                    <Paperclip className="w-5 h-5 text-gray-400" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 truncate">{file.name}</p>
                    <p className="text-xs text-gray-500">
                      {(file.size / 1024).toFixed(1)} KB • {formatTimestamp(file.uploadedAt || new Date())}
                    </p>
                  </div>
                </div>
              ))
            ) : (
              <div className="flex items-center justify-center py-4">
                <p className="text-sm text-gray-500">No attachments</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <>
      {mainContent}
      {previewImageSrc && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full relative flex flex-col items-center">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500"
              onClick={() => setPreviewImageSrc(null)}
              aria-label="Close preview"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewImageSrc}
              alt="Preview"
              className="max-h-[60vh] w-auto mx-auto rounded-lg border border-gray-200 bg-gray-100"
              onError={e => {
                e.target.onerror = null;
                e.target.style.display = 'none';
                const fallback = document.getElementById('img-fallback');
                if (fallback) fallback.style.display = 'block';
              }}
            />
            <a
              href={previewImageSrc}
              download="image.png"
              className="mt-4 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 font-medium"
            >
              Download
            </a>
            <div id="img-fallback" style={{display:'none'}} className="text-red-500 text-center mt-8">
              Unable to preview this image.<br/>Please make sure the file is a valid image.
            </div>
          </div>
        </div>
      )}
    </>
  );
};

TicketDetails.propTypes = {
  ticketId: PropTypes.string.isRequired,
  onBack: PropTypes.func.isRequired,
  onAssign: PropTypes.func.isRequired
};

export default TicketDetails;