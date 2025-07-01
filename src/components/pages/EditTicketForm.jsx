import { useState, useEffect } from 'react';
import { db } from '../../firebase/config';
import { doc, getDoc, setDoc } from 'firebase/firestore';

const defaultFields = [
  { id: 'subject', label: 'Subject', type: 'text', required: true },
  { id: 'description', label: 'Description', type: 'textarea', required: true },
  { id: 'category', label: 'Category', type: 'dropdown', required: true, options: ['Incident-request', 'Service-request', 'Change-request'] },
  { id: 'priority', label: 'Priority', type: 'dropdown', required: true, options: ['Low', 'Medium', 'High'] },
];

export default function EditTicketForm() {
  const [fields, setFields] = useState(defaultFields);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState('');

  // Load config from Firestore
  useEffect(() => {
    const fetchConfig = async () => {
      setLoading(true);
      try {
        const configRef = doc(db, 'config', 'formConfig');
        const configSnap = await getDoc(configRef);
        if (configSnap.exists()) {
          setFields(configSnap.data().fields || defaultFields);
        } else {
          // If not exists, create default
          await setDoc(configRef, { fields: defaultFields });
          setFields(defaultFields);
        }
      } catch (err) {
        setStatus('Failed to load config');
      } finally {
        setLoading(false);
      }
    };
    fetchConfig();
  }, []);

  // Placeholder handlers
  const addField = () => {
    setFields([...fields, { id: `field${fields.length + 1}`, label: 'New Field', type: 'text', required: false }]);
  };
  const removeField = (index) => {
    setFields(fields.filter((_, i) => i !== index));
  };
  const updateField = (index, key, value) => {
    setFields(fields.map((f, i) => i === index ? { ...f, [key]: value } : f));
  };
  const addOption = (index) => {
    setFields(fields.map((f, i) => i === index ? { ...f, options: [...(f.options || []), 'New Option'] } : f));
  };
  const updateOption = (fieldIdx, optIdx, value) => {
    setFields(fields.map((f, i) => i === fieldIdx ? { ...f, options: f.options.map((o, j) => j === optIdx ? value : o) } : f));
  };
  const removeOption = (fieldIdx, optIdx) => {
    setFields(fields.map((f, i) => i === fieldIdx ? { ...f, options: f.options.filter((_, j) => j !== optIdx) } : f));
  };

  // Save config to Firestore
  const handleSave = async (e) => {
    e.preventDefault();
    setSaving(true);
    setStatus('');
    try {
      const configRef = doc(db, 'config', 'formConfig');
      await setDoc(configRef, { fields });
      setStatus('Saved!');
    } catch (err) {
      setStatus('Failed to save');
    } finally {
      setSaving(false);
      setTimeout(() => setStatus(''), 2000);
    }
  };

  if (loading) return <div className="text-center py-12">Loading form config...</div>;

  return (
    <div className="max-w-3xl mx-auto p-6 bg-white rounded-xl shadow border mt-8">
      <h2 className="text-2xl font-bold mb-6">Edit Ticket Form</h2>
      <form onSubmit={handleSave}>
        <div className="space-y-6">
          {fields.map((field, idx) => (
            <div key={field.id} className="p-4 border rounded-lg bg-gray-50 flex flex-col gap-2">
              <div className="flex gap-2 items-center">
                <input
                  className="border rounded px-2 py-1 flex-1"
                  value={field.label}
                  onChange={e => updateField(idx, 'label', e.target.value)}
                  placeholder="Field Label"
                />
                <select
                  className="border rounded px-2 py-1"
                  value={field.type}
                  onChange={e => updateField(idx, 'type', e.target.value)}
                >
                  <option value="text">Text</option>
                  <option value="textarea">Textarea</option>
                  <option value="dropdown">Dropdown</option>
                </select>
                <label className="flex items-center gap-1 text-xs">
                  <input
                    type="checkbox"
                    checked={field.required}
                    onChange={e => updateField(idx, 'required', e.target.checked)}
                  />
                  Required
                </label>
                <button className="text-red-500 ml-2" onClick={() => removeField(idx)} type="button">Remove</button>
              </div>
              {field.type === 'dropdown' && (
                <div className="ml-4 space-y-1">
                  <div className="flex gap-2 items-center mb-1">
                    <span className="font-semibold text-xs">Options:</span>
                    <button className="text-blue-600 text-xs" onClick={() => addOption(idx)} type="button">Add Option</button>
                  </div>
                  {(field.options || []).map((opt, optIdx) => (
                    <div key={optIdx} className="flex gap-2 items-center">
                      <input
                        className="border rounded px-2 py-1 flex-1"
                        value={opt}
                        onChange={e => updateOption(idx, optIdx, e.target.value)}
                        placeholder="Option"
                      />
                      <button className="text-red-400 text-xs" onClick={() => removeOption(idx, optIdx)} type="button">Remove</button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
        <button className="mt-6 px-4 py-2 bg-blue-600 text-white rounded-lg" onClick={addField} type="button">Add Field</button>
        <div className="mt-8 text-right flex items-center gap-4 justify-end">
          {status && <span className="text-sm text-green-600">{status}</span>}
          <button className="px-6 py-2 bg-green-600 text-white rounded-lg" type="submit" disabled={saving}>{saving ? 'Saving...' : 'Save Changes'}</button>
        </div>
      </form>
    </div>
  );
} 