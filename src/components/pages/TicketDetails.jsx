import PropTypes from 'prop-types';
import { useState, useEffect, useRef } from 'react';
import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp, collection, query, where, getDocs } from 'firebase/firestore';
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
  Link
} from 'lucide-react';
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

const TicketDetails = ({ ticketId, onBack }) => {
  const [ticket, setTicket] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newResponse, setNewResponse] = useState('');
  const [isSendingResponse, setIsSendingResponse] = useState(false);
  const [activeTab, setActiveTab] = useState('Commentbox');
  const [currentUserName, setCurrentUserName] = useState('');
  const commentsEndRef = useRef(null);

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
      };
      await updateDoc(ticketRef, {
        comments: arrayUnion(comment),
        lastUpdated: serverTimestamp()
      });
      setNewResponse('');
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
        // Optionally send email notification here
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

  return (
    <div className="flex flex-col lg:flex-row gap-8">
      {/* Main Content */}
      <div className="flex-1 min-w-0">
      <div className="flex flex-col md:flex-row gap-4 mb-8">


</div>


        {/* Tabs */}
        <div className="border-b mb-8 px-2">
          <nav className="flex flex-wrap gap-2">
            {['Commentbox','Details','Checklists','Resolution','Time Elapsed Analysis'].map(tab => (
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
        <div className="px-2 pb-2">
          {activeTab === 'Commentbox' && (
            <>
              {/* Comments List */}
              <div className="bg-gradient-to-br from-blue-50 to-white rounded-2xl p-6 shadow-sm mb-10 max-h-96 overflow-y-auto">
                <div className="mb-4 text-base text-gray-700 font-semibold">Comment Box</div>
                <div className="space-y-6">
                  {ticket.comments && ticket.comments.length > 0 ? (
                    ticket.comments.map((comment, index) => (
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
                            <div className="text-gray-900 whitespace-pre-wrap leading-relaxed">{comment.message}</div>
                          </div>
                        </div>
                      </div>
                    ))
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
                  <textarea
                    className="w-full p-4 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-y min-h-[100px] bg-gray-50 shadow-sm"
                    placeholder="Type your comment here..."
                    value={newResponse}
                    onChange={(e) => setNewResponse(e.target.value)}
                    rows="4"
                  ></textarea>
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
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div><span className="font-semibold text-gray-700">Request ID:</span> {ticket.ticketNumber}</div>
                  <div><span className="font-semibold text-gray-700">Status:</span> {ticket.status}</div>
                  <div><span className="font-semibold text-gray-700">Priority:</span> {ticket.priority}</div>
                  <div><span className="font-semibold text-gray-700">Category:</span> {ticket.category}</div>
                  <div><span className="font-semibold text-gray-700">Project:</span> {ticket.project}</div>
                  <div><span className="font-semibold text-gray-700">Created:</span> {ticket.created ? new Date(ticket.created.toDate()).toLocaleString() : 'N/A'}</div>
                  <div><span className="font-semibold text-gray-700">Assigned To:</span> {ticket.assignedTo ? (ticket.assignedTo.name || ticket.assignedTo.email) : '-'}</div>
                  <div><span className="font-semibold text-gray-700">Requester:</span> {ticket.customer} ({ticket.email})</div>
                </div>
              </div>
              <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                <div className="font-semibold text-gray-700 mb-2">Description</div>
                <div className="whitespace-pre-wrap break-words text-gray-900 border border-gray-100 rounded-lg p-4 bg-gray-50" style={{ fontFamily: 'inherit', fontSize: '1rem', minHeight: '80px' }}>
                  {ticket.description || <span className="text-gray-400">No description provided.</span>}
                </div>
              </div>
              {ticket.attachments && ticket.attachments.length > 0 && (
                <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm">
                  <div className="font-semibold text-gray-700 mb-2">Attachments ({ticket.attachments.length})</div>
                  <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
                    {ticket.attachments.map((file, index) => (
                      <div key={index} className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-3 shadow-sm">
                        <span>
                          {file.type.startsWith('image/') ? (
                            <svg className="w-5 h-5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                            </svg>
                          ) : file.type === 'application/pdf' ? (
                            <svg className="w-5 h-5 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          ) : (
                            <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                            </svg>
                          )}
                        </span>
                        <span className="text-xs font-medium text-gray-700 text-center truncate w-full" title={file.name}>{file.name}</span>
                        <span className="text-xs text-gray-400">({(file.size / 1024).toFixed(1)} KB)</span>
                        {/* Preview/Download Button */}
                        {file.type.startsWith('image/') ? (
                          <a
                            href={file.data}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-blue-600 hover:text-blue-800 text-xs font-medium"
                          >
                            Preview
                          </a>
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
          {activeTab === 'Checklists' && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-6">
              <div className="font-bold text-lg text-gray-900 mb-4">Checklists</div>
              <ul className="space-y-3">
                <li className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full bg-green-400 flex items-center justify-center text-white text-xs">✓</span>
                  <span className="text-gray-800">Verify SAP EWM system connectivity</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs">•</span>
                  <span className="text-gray-800">Check user authorization for warehouse tasks</span>
                </li>
                <li className="flex items-center gap-3">
                  <span className="w-4 h-4 rounded-full bg-gray-300 flex items-center justify-center text-white text-xs">•</span>
                  <span className="text-gray-800">Review error logs for recent failures</span>
                </li>
              </ul>
            </div>
          )}
          {activeTab === 'Resolution' && (
            <div className="bg-white rounded-2xl border border-gray-100 p-8 shadow-sm space-y-6">
              <div className="font-bold text-lg text-gray-900 mb-4">Resolution</div>
              <div className="text-gray-800 mb-2">Sample resolution steps for this ticket:</div>
              <ol className="list-decimal list-inside space-y-2 text-gray-700">
                <li>Identified root cause as missing master data in SAP EWM.</li>
                <li>Updated the master data and reprocessed the failed delivery.</li>
                <li>Confirmed with the user that the issue is resolved.</li>
              </ol>
              <div className="mt-4 text-green-700 font-semibold">Status: Resolved</div>
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
    
    </div>
  );
};

TicketDetails.propTypes = {
  ticketId: PropTypes.string.isRequired,
  onBack: PropTypes.func.isRequired
};

export default TicketDetails;