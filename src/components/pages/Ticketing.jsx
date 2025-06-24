import React, { useState, useRef, useEffect } from 'react';
import {
  Send,
  Paperclip,
  CheckCircle,
  File,
  FileText,
  Image,
  Video,
  Loader2,
  X,
  AlertCircle,
  ChevronRight
} from 'lucide-react';
import { collection, addDoc, serverTimestamp, query, where, getDocs, updateDoc, doc, getDoc, runTransaction } from 'firebase/firestore';
import { db, auth } from '../../firebase/config';
import { sendEmail } from '../../utils/sendEmail';
 
function Client() {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    project: 'General',
    subject: '',
    priority: 'Medium',
    description: '',
    category: 'Technical Issue'
  });
 
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitSuccess, setSubmitSuccess] = useState(false);
  const [errors, setErrors] = useState({});
  const [attachments, setAttachments] = useState([]);
  const [ticketId, setTicketId] = useState(null);
  const [userData, setUserData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [currentStep, setCurrentStep] = useState(1);
  const fileInputRef = useRef(null);
  const [previewFile, setPreviewFile] = useState(null);
 
  const priorities = [
    { value: 'Low', color: 'text-green-600', bgColor: 'bg-green-50', borderColor: 'border-green-200', description: 'Non-urgent, can wait', icon: '🟢' },
    { value: 'Medium', color: 'text-yellow-600', bgColor: 'bg-yellow-50', borderColor: 'border-yellow-200', description: 'Normal priority', icon: '🟡' },
    { value: 'High', color: 'text-red-600', bgColor: 'bg-red-50', borderColor: 'border-red-200', description: 'Urgent, needs immediate attention', icon: '🔴' }
  ];
 
  const categories = [
    { value: 'Inscedent'},
    { value: 'Service' },
    { value: 'Change' },
  ];

  // Fetch user data on component mount
  useEffect(() => {
    const fetchUserData = async () => {
      try {
        const currentUser = auth.currentUser;
        if (currentUser) {
          const userDocRef = doc(db, 'users', currentUser.uid);
          const userDocSnap = await getDoc(userDocRef);
          let name = '';
          if (userDocSnap.exists()) {
            const data = userDocSnap.data();
            if (data.firstName || data.lastName) {
              name = `${data.firstName || ''} ${data.lastName || ''}`.trim();
            }
            if (!name) {
              name = (data.email || currentUser.email || '').split('@')[0];
            }
            name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            setUserData(data);
            setFormData(prev => ({
              ...prev,
              name: prev.name || name,
              email: data.email || currentUser.email || '',
              project: data.project || 'General'
            }));
          } else {
            name = currentUser.displayName || (currentUser.email?.split('@')[0] || '');
            name = name.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
            setFormData(prev => ({
              ...prev,
              email: currentUser.email || '',
              name: prev.name || name
            }));
          }
        }
      } catch (error) {
        console.error('Error fetching user data:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchUserData();
  }, []);
 
  const validateForm = async () => {
    const newErrors = {};
   
    if (!formData.name.trim()) newErrors.name = 'Name is required';
    if (!formData.email.trim()) newErrors.email = 'Email is required';
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(formData.email)) newErrors.email = 'Invalid email format';
    if (!formData.subject.trim()) newErrors.subject = 'Subject is required';
    if (!formData.description.trim()) newErrors.description = 'Description is required';
    else if (formData.description.trim().length < 10) newErrors.description = 'Description must be at least 10 characters';
 
    // Check for duplicate tickets
    if (formData.subject.trim() && formData.email.trim()) {
      const isDuplicate = await checkDuplicateTicket(formData.subject, formData.email);
      if (isDuplicate) {
        newErrors.submit = 'A similar ticket was submitted in the last 24 hours. Please check your email for updates.';
      }
    }
 
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };
 
  const handleFileChange = (e) => {
    const files = Array.from(e.target.files);
    const maxSize = 10 * 1024 * 1024; // 10MB
    const validFiles = files.filter(file => {
      if (file.size > maxSize) {
        alert(`File ${file.name} is too large. Maximum size is 10MB.`);
        return false;
      }
      return true;
    });

    // Read each file as Data URL and add to attachments
    validFiles.forEach(file => {
      const reader = new FileReader();
      reader.onload = (event) => {
        setAttachments(prev => ([
          ...prev,
          {
            name: file.name,
            type: file.type,
            size: file.size,
            data: event.target.result
          }
        ]));
      };
      reader.readAsDataURL(file);
    });

    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };
 
  const removeAttachment = (index) => {
    setAttachments(prev => prev.filter((_, i) => i !== index));
  };
 
  const getFileIcon = (file) => {
    const type = file.type.split('/')[0];
    switch (type) {
      case 'image':
        return <Image className="w-4 h-4" />;
      case 'video':
        return <Video className="w-4 h-4" />;
      case 'application':
        if (file.type.includes('pdf')) {
          return <FileText className="w-4 h-4" />;
        }
        return <File className="w-4 h-4" />;
      default:
        return <File className="w-4 h-4" />;
    }
  };
 
  const formatFileSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };
 
  // Helper to get the next ticket number for a category
  const getNextTicketNumber = async (category) => {
    let prefix, counterDocId, startValue;
    if (category === 'Inscedent') {
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
      // fallback
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
 
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!await validateForm()) return;
   
    setIsSubmitting(true);
    setErrors({});
   
    try {
      // Process attachments (ensure all are base64 Data URLs)
      const processedFiles = await Promise.all(
        attachments.map(async (file) => {
          if (file.data) return file; // Already processed
          const reader = new FileReader();
          return new Promise((resolve) => {
            reader.onload = (e) => {
              resolve({
                name: file.name,
                type: file.type,
                size: file.size,
                data: e.target.result
              });
            };
            reader.readAsDataURL(file);
          });
        })
      );
     
      // Get the next ticket number based on category
      const ticketNumber = await getNextTicketNumber(formData.category);
     
      // Create the ticket document in Firestore
      const ticketData = {
        subject: formData.subject,
        customer: formData.name,
        email: formData.email,
        project: formData.project,
        category: formData.category === 'Others' ? (formData.otherIssue || 'Others') : formData.category,
        priority: formData.priority,
        description: formData.description,
        status: 'Open',
        created: serverTimestamp(),
        starred: false,
        attachments: processedFiles, // Always include attachments
        ticketNumber, // Use the generated ticket number
        lastUpdated: serverTimestamp(),
        userId: auth.currentUser?.uid || null
      };
 
      // Add to Firestore
      const docRef = await addDoc(collection(db, 'tickets'), ticketData);
      setTicketId(ticketNumber); // Show the ticketNumber, not docRef.id
     
      // Update the ticket with its Firestore doc ID (if needed)
      await updateDoc(docRef, {
        ticketId: docRef.id
      });

      // Fetch project members' emails
      const memberEmails = await fetchProjectMemberEmails(ticketData.project);
      // Prepare email parameters for EmailJS
      const emailParams = {
        to_email: memberEmails.join(','),
        from_name: 'Articket Support',
        reply_to: ticketData.email,
        subject: ticketData.subject,
        name: ticketData.customer,
        email: ticketData.email,
        project: ticketData.project,
        category: ticketData.category,
        priority: ticketData.priority,
        description: ticketData.description,
        attachments: ticketData.attachments?.map(a => a.name).join(', '),
        ticket_link: `https://articket.vercel.app/tickets/${docRef.id}`,
        ticket_number: ticketNumber // Add ticket number to email params
      };
      console.log('Email params:', emailParams);
      await sendEmail(emailParams);
     
      setIsSubmitting(false);
      setSubmitSuccess(true);
      setAttachments([]);
     
      // Reset form after success
      setTimeout(() => {
        setFormData(prev => ({
          ...prev,
          name: userData ? `${userData.firstName || ''} ${userData.lastName || ''}`.trim() : '',
          email: userData?.email || auth.currentUser?.email || '',
          project: userData?.project || 'General',
          subject: '',
          priority: 'Medium',
          description: '',
          category: 'Technical Issue',
          otherIssue: ''
        }));
        setSubmitSuccess(false);
        setTicketId(null);
        setCurrentStep(1);
      }, 3000);
    } catch (error) {
      console.error('Error adding ticket:', error);
      setIsSubmitting(false);
      setErrors({ submit: error.message || 'Failed to submit ticket. Please try again.' });
    }
  };
 
  // Add a function to check for duplicate tickets
  const checkDuplicateTicket = async (subject, email) => {
    const q = query(
      collection(db, 'tickets'),
      where('email', '==', email)
    );
   
    const querySnapshot = await getDocs(q);
    const last24Hours = new Date(Date.now() - 24 * 60 * 60 * 1000);
   
    return querySnapshot.docs.some(doc => {
      const data = doc.data();
      const createdTime = data.created?.toDate?.() || new Date(data.created);
      return data.subject === subject && createdTime >= last24Hours;
    });
  };
 
  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
   
    // Clear error when user starts typing
    if (errors[name]) {
      setErrors(prev => ({ ...prev, [name]: '' }));
    }
  };

  const nextStep = () => {
    if (currentStep < 4) {
      setCurrentStep(currentStep + 1);
    }
  };

  const prevStep = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  // Helper to fetch all emails of users in the selected project
  const fetchProjectMemberEmails = async (projectName) => {
    const usersRef = collection(db, 'users');
    const q = query(usersRef, where('project', '==', projectName));
    const querySnapshot = await getDocs(q);
    return querySnapshot.docs.map(doc => doc.data().email).filter(Boolean);
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your information...</p>
        </div>
      </div>
    );
  }
 
  if (submitSuccess) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
        <div className="bg-white rounded-3xl shadow-2xl p-10 w-full max-w-xl text-center border border-gray-100">
          <div className="w-20 h-20 bg-gradient-to-br from-green-400 to-green-600 rounded-full flex items-center justify-center mx-auto mb-6 shadow-lg">
            <CheckCircle className="w-10 h-10 text-white" />
          </div>
          <h2 className="text-3xl font-bold text-gray-900 mb-4">Ticket Created!</h2>
          <p className="text-gray-600 mb-6 text-lg">
            Your support ticket has been successfully created. Our team will get back to you soon.
          </p>
          <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-6 mb-6 border border-blue-100">
            <p className="text-sm text-gray-600 mb-2">Ticket ID</p>
            <p className="font-mono text-xl font-bold text-blue-600">{ticketId}</p>
          </div>
          <button
            onClick={() => setSubmitSuccess(false)}
            className="w-full bg-gradient-to-r from-blue-600 to-blue-700 text-white py-4 px-6 rounded-2xl font-semibold text-lg hover:from-blue-700 hover:to-blue-800 transition-all duration-200 transform hover:scale-105 shadow-lg"
          >
            Create Another Ticket
          </button>
        </div>
      </div>
    );
  }
 
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 w-full">
      <div className="w-full max-w-4xl mx-auto px-4 py-10">
        {/* Card Container */}
        <div className="bg-white rounded-3xl shadow-2xl border border-gray-100 p-0 overflow-hidden">
          {/* Stepper */}
          <div className="bg-gradient-to-r from-blue-600 to-blue-500 px-8 py-6 flex flex-col md:flex-row md:items-center gap-4">
            <div className="flex-1 flex items-center gap-0 md:gap-2">
              {[1, 2, 3, 4].map((step) => (
                <React.Fragment key={step}>
                  <div className={`w-10 h-10 rounded-full flex items-center justify-center font-semibold text-lg transition-all duration-200 border-2 ${
                    currentStep >= step
                      ? 'bg-white text-blue-700 border-blue-600 shadow-lg'
                      : 'bg-blue-200 text-blue-400 border-blue-300'
                  }`}>
                    {step}
                  </div>
                  {step < 4 && (
                    <div className={`h-1 w-10 md:w-16 transition-all duration-200 ${
                      currentStep > step ? 'bg-blue-600' : 'bg-blue-200'
                    }`} />
                  )}
                </React.Fragment>
              ))}
            </div>
            <div className="text-white text-sm font-medium text-center md:text-right flex-1">
              Step {currentStep} of 4: {
                currentStep === 1 ? 'Basic Information' :
                currentStep === 2 ? 'Issue Details' :
                currentStep === 3 ? 'Priority & Category' :
                'Review & Submit'
              }
            </div>
          </div>

          {/* Form Section */}
          <form onSubmit={handleSubmit} className="p-8 md:p-12 space-y-12">
            {/* Step 1: Basic Information */}
            {currentStep === 1 && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Your Details</h2>
                  <p className="text-gray-500 mb-6">We use this information to contact you about your ticket.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                  <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Full Name</label>
                    <input
                      type="text"
                      name="name"
                      value={formData.name}
                        readOnly
                        className="w-full px-4 py-3 border-2 rounded-xl bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                  </div>
                  <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Email Address</label>
                    <input
                      type="email"
                      name="email"
                      value={formData.email}
                        readOnly
                        className="w-full px-4 py-3 border-2 rounded-xl bg-gray-100 text-gray-700 cursor-not-allowed"
                    />
                  </div>
                  <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Project</label>
                      <input
                        type="text"
                      name="project"
                      value={formData.project}
                        readOnly
                        className="w-full px-4 py-3 border-2 rounded-xl bg-gray-100 text-gray-700 cursor-not-allowed"
                      />
                    </div>
                  </div>
                </div>
                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={nextStep}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center space-x-2 shadow-md"
                  >
                    <span>Continue</span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}
 
            {/* Step 2: Issue Details */}
            {currentStep === 2 && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Describe Your Issue</h2>
                  <p className="text-gray-500 mb-6">Be as detailed as possible to help us resolve it faster.</p>
                  <div className="space-y-6">
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Subject *</label>
                      <input
                        type="text"
                        name="subject"
                        value={formData.subject}
                        onChange={handleInputChange}
                        className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 ${
                          errors.subject ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                        }`}
                        placeholder="Brief summary of your issue"
                      />
                      {errors.subject && <p className="text-red-600 text-sm flex items-center mt-1"><AlertCircle className="w-4 h-4 mr-1" />{errors.subject}</p>}
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-gray-700 mb-1">Description *</label>
                      <textarea
                        name="description"
                        value={formData.description}
                        onChange={handleInputChange}
                        rows={6}
                        className={`w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-y transition-all duration-200 ${
                          errors.description ? 'border-red-300 bg-red-50' : 'border-gray-200 hover:border-gray-300'
                        } max-h-48 min-h-[96px]`}
                        style={{ overflowY: 'auto', wordBreak: 'break-word', whiteSpace: 'pre-wrap' }}
                        placeholder="Please provide detailed information about your issue..."
                      />
                      {errors.description && <p className="text-red-600 text-sm flex items-center mt-1"><AlertCircle className="w-4 h-4 mr-1" />{errors.description}</p>}
                      <p className="text-gray-400 text-xs mt-2">Character count: {formData.description.length} (minimum 10 characters)</p>
                    </div>
                    {/* Add Files Section */}
                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2 text-gray-600">
                          <Paperclip className="w-4 h-4" />
                          <span className="text-sm font-medium">Attachments (Optional)</span>
                        </div>
                        <input
                          type="file"
                          ref={fileInputRef}
                          onChange={handleFileChange}
                          multiple
                          className="hidden"
                          accept=".pdf,.doc,.docx,.txt,.jpg,.jpeg,.png,.gif,.mp4,.avi,.mov"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="text-sm text-blue-600 hover:text-blue-700 font-medium transition-colors"
                        >
                          Add Files
                        </button>
                      </div>
                      {attachments.length > 0 && (
                        <div className="space-y-3 mt-4">
                          {attachments.map((file, index) => (
                            <div
                              key={index}
                              className="flex items-center justify-between p-4 bg-white rounded-xl border border-gray-200 shadow-sm"
                            >
                              <div className="flex items-center space-x-3">
                                <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                                  {getFileIcon(file)}
                                </div>
                                <div>
                                  <p className="text-sm font-medium text-gray-700">{file.name}</p>
                                  <p className="text-xs text-gray-500">{formatFileSize(file.size)}</p>
                                </div>
                              </div>
                              <button
                                type="button"
                                onClick={() => removeAttachment(index)}
                                className="text-gray-400 hover:text-red-500 transition-colors p-1"
                              >
                                <X className="w-4 h-4" />
                              </button>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex justify-between">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="text-gray-600 hover:text-gray-800 font-medium transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center space-x-2 shadow-md"
                  >
                    <span>Continue</span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 3: Priority & Category */}
            {currentStep === 3 && (
              <div className="space-y-8">
                <div>
                  <h2 className="text-xl font-bold text-gray-900 mb-2">Categorize Your Request</h2>
                  <p className="text-gray-500 mb-6">This helps us route your ticket to the right team.</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-3">Type of Issue</h3>
                      <select
                        className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                        value={formData.category}
                        onChange={e => setFormData(prev => ({ ...prev, category: e.target.value, otherIssue: '' }))}
                      >
                        {categories.map(category => (
                          <option key={category.value} value={category.value}>
                            {category.icon} {category.value} - {category.description}
                          </option>
                        ))}
                      </select>
                      {/* Show input if 'Others' is selected */}
                      {formData.category === 'Others' && (
                        <div className="mt-4">
                          <label className="block text-sm font-semibold text-gray-700 mb-1">Please specify the issue</label>
                          <input
                            type="text"
                            name="otherIssue"
                            value={formData.otherIssue || ''}
                            onChange={e => setFormData(prev => ({ ...prev, otherIssue: e.target.value }))}
                            className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 border-gray-200 hover:border-gray-300"
                            placeholder="Describe your issue"
                            required
                          />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="font-semibold text-gray-800 mb-3">Priority</h3>
                      <select
                        className="w-full px-4 py-3 border-2 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition-all duration-200 border-gray-200 hover:border-gray-300 bg-white text-gray-700"
                        value={formData.priority}
                        onChange={e => setFormData(prev => ({ ...prev, priority: e.target.value }))}
                      >
                        {priorities.map(priority => (
                          <option key={priority.value} value={priority.value}>
                            {priority.icon} {priority.value} - {priority.description}
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>
                <div className="flex justify-between mt-8">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="text-gray-600 hover:text-gray-800 font-medium transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    type="button"
                    onClick={nextStep}
                    className="bg-gradient-to-r from-blue-600 to-blue-700 text-white px-8 py-3 rounded-xl font-semibold hover:from-blue-700 hover:to-blue-800 transition-all duration-200 flex items-center space-x-2 shadow-md"
                  >
                    <span>Continue</span>
                    <ChevronRight className="w-5 h-5" />
                  </button>
                </div>
              </div>
            )}

            {/* Step 4: Review & Submit */}
            {currentStep === 4 && (
              <div className="space-y-8">
                <div className="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-2xl p-0 border border-blue-100 shadow-md">
                  {/* Subject as header */}
                  <div className="bg-white rounded-t-2xl px-8 py-6 border-b border-blue-100 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <h2 className="text-xl font-bold text-gray-900 mb-1 truncate">{formData.subject || 'No Subject'}</h2>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600 mt-2">
                        <span><span className="font-semibold text-gray-800">From:</span> {formData.name} &lt;{formData.email}&gt;</span>
                        <span><span className="font-semibold text-gray-800">Project:</span> {formData.project}</span>
                        <span><span className="font-semibold text-gray-800">Category:</span> {formData.category}</span>
                        <span><span className="font-semibold text-gray-800">Priority:</span> <span className={`px-2 py-0.5 rounded text-xs font-semibold ${
                          formData.priority === 'High' ? 'bg-red-100 text-red-700' :
                          formData.priority === 'Medium' ? 'bg-yellow-100 text-yellow-700' :
                          'bg-green-100 text-green-700'
                        }`}>{formData.priority}</span></span>
                      </div>
                    </div>
                  </div>
                  {/* Description as email body */}
                  <div className="bg-white px-8 py-8 rounded-b-2xl" style={{ minHeight: '120px' }}>
                    <div className="mb-8">
                      <div className="font-semibold text-gray-800 mb-2">Description</div>
                      <div className="whitespace-pre-wrap break-words text-gray-900 max-h-48 overflow-y-auto border border-gray-100 rounded-lg p-4 bg-gray-50" style={{ fontFamily: 'inherit', fontSize: '1rem' }}>
                        {formData.description || <span className="text-gray-400">No description provided.</span>}
                      </div>
                    </div>
                    {/* Attachments Preview */}
                    <div className="mt-4">
                      <div className="font-semibold text-gray-800 mb-2 flex items-center gap-2">
                        <Paperclip className="w-4 h-4" /> Attachments
                      </div>
                      {attachments.length > 0 ? (
                        <div className="flex flex-row flex-nowrap gap-4 overflow-x-auto pb-2">
                          {attachments.map((file, index) => (
                            <div key={index} className="flex flex-col items-center gap-2 bg-white border border-gray-200 rounded-lg px-3 py-2 shadow-sm min-w-[140px] max-w-[180px]">
                              <span>{getFileIcon(file)}</span>
                              <span className="text-sm font-medium text-gray-700 truncate w-full text-center" title={file.name}>{file.name}</span>
                              <span className="text-xs text-gray-400">({formatFileSize(file.size)})</span>
                              {/* Preview Button */}
                              {file.type.startsWith('image/') ? (
                                <button
                                  type="button"
                                  className="text-blue-600 hover:underline text-xs"
                                  onClick={() => setPreviewFile(file)}
                                >
                                  Preview
                                </button>
                              ) : file.type === 'application/pdf' ? (
                                <a
                                  href={file.data}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-blue-600 hover:underline text-xs"
                                >
                                  Preview
                                </a>
                              ) : (
                                <a
                                  href={file.data}
                                  download={file.name}
                                  className="text-blue-600 hover:underline text-xs"
                                >
                                  Download
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      ) : (
                        <div className="text-gray-400 text-sm">No attachments</div>
                      )}
                    </div>
                  </div>
                </div>
                {errors.submit && (
                  <div className="bg-red-50 border border-red-200 rounded-xl p-4 mt-6">
                    <p className="text-red-600 text-sm flex items-center">
                      <AlertCircle className="w-4 h-4 mr-2" />
                      {errors.submit}
                    </p>
                  </div>
                )}
                <div className="flex justify-between mt-8">
                  <button
                    type="button"
                    onClick={prevStep}
                    className="text-gray-600 hover:text-gray-800 font-medium transition-colors"
                  >
                    ← Back
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className={`px-8 py-4 rounded-xl font-semibold text-lg flex items-center space-x-3 transition-all duration-200 transform hover:scale-105 shadow-lg ${
                      isSubmitting
                        ? 'bg-gray-400 cursor-not-allowed'
                        : 'bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800'
                    } text-white`}
                  >
                    {isSubmitting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        <span>Creating Ticket...</span>
                      </>
                    ) : (
                      <>
                        <Send className="w-5 h-5" />
                        <span>Create Ticket</span>
                      </>
                    )}
                  </button>
                </div>
              </div>
            )}
          </form>
        </div>
      </div>
      {/* Modal for image preview */}
      {previewFile && previewFile.type.startsWith('image/') && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-60">
          <div className="bg-white rounded-xl shadow-lg p-6 max-w-lg w-full relative flex flex-col items-center">
            <button
              className="absolute top-2 right-2 text-gray-500 hover:text-red-500"
              onClick={() => setPreviewFile(null)}
              aria-label="Close preview"
            >
              <X className="w-6 h-6" />
            </button>
            <img
              src={previewFile.data}
              alt={previewFile.name}
              className="max-h-[60vh] w-auto mx-auto rounded-lg border border-gray-200 bg-gray-100"
              onError={e => {
                e.target.onerror = null;
                e.target.style.display = 'none';
                const fallback = document.getElementById('img-fallback');
                if (fallback) fallback.style.display = 'block';
              }}
            />
            <div id="img-fallback" style={{display:'none'}} className="text-red-500 text-center mt-8">
              Unable to preview this image.<br/>Please make sure the file is a valid image.
            </div>
            <div className="mt-4 text-center text-gray-700 text-sm break-all">{previewFile.name}</div>
          </div>
        </div>
      )}
    </div>
  );
}
 
export default Client;
 