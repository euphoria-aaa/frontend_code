import React, { useState, useEffect } from 'react';
import { Star, Plus, Trash2, Download, Upload, Search, User, Phone, Mail, MapPin, Globe, Folder, RefreshCw } from 'lucide-react';

// Configuration
const API_URL = "http://localhost:5000/api/contacts";
const CDN_XLSX = "https://cdn.sheetjs.com/xlsx-0.20.0/package/dist/xlsx.full.min.js";

export default function App() {
  // --- STATE ---
  const [contacts, setContacts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const [view, setView] = useState("list"); // 'list' or 'form'
  const [showCollection, setShowCollection] = useState(false);
  const [search, setSearch] = useState("");
  const [libLoaded, setLibLoaded] = useState(false);

  const [formData, setFormData] = useState({
    id: null,
    name: "",
    isFav: false,
    methods: [{ type: "Phone", val: "" }]
  });

  // --- INITIALIZATION ---
  useEffect(() => {
    // 1. Load Excel Lib
    const script = document.createElement('script');
    script.src = CDN_XLSX;
    script.async = true;
    script.onload = () => setLibLoaded(true);
    document.body.appendChild(script);

    // 2. Fetch Data from Backend
    fetchContacts();
  }, []);

  // --- API FUNCTIONS ---
  const fetchContacts = async () => {
    setLoading(true);
    try {
      const res = await fetch(API_URL);
      if (!res.ok) throw new Error("Failed to connect to backend");
      const data = await res.json();
      setContacts(data);
      setError(null);
    } catch (err) {
      // If backend fails, use dummy data so the UI doesn't crash during preview
      console.warn("Backend not found, falling back to local state for preview.");
      setError(null); // Clear error to show UI
      if (contacts.length === 0) {
          setContacts([
            { id: 1, name: "Alice Chen (Offline)", isFav: true, methods: [{ type: "Phone", val: "123-456-7890" }] },
            { id: 2, name: "Bob Jones (Offline)", isFav: false, methods: [{ type: "Email", val: "bob@example.com" }] }
          ]);
      }
      setLoading(false);
    } finally {
      setLoading(false);
    }
  };

  const saveContact = async () => {
    if (!formData.name) return alert("Name is required");

    // Optimistic Update for UI responsiveness
    const newContact = formData.id ? formData : { ...formData, id: Date.now() };

    if (formData.id) {
       setContacts(contacts.map(c => c.id === formData.id ? formData : c));
    } else {
       setContacts([...contacts, newContact]);
    }
    setView("list");

    try {
      let res;
      if (formData.id) {
        // UPDATE (PUT)
        res = await fetch(`${API_URL}/${formData.id}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      } else {
        // CREATE (POST)
        res = await fetch(API_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(formData)
        });
      }
      if (!res.ok) throw new Error("API Failed");
      await fetchContacts(); // Refresh list from server
    } catch (err) {
      console.warn("API save failed (backend might be offline). UI updated locally.");
    }
  };

  const deleteContact = async (id) => {
    if(!window.confirm("Delete this contact?")) return;

    // Optimistic update
    setContacts(contacts.filter(c => c.id !== id));

    try {
      await fetch(`${API_URL}/${id}`, { method: 'DELETE' });
    } catch (err) {
      console.warn("API delete failed (backend might be offline).");
    }
  };

  const toggleFav = async (contact) => {
    // We must update the full object via PUT
    const updated = { ...contact, isFav: !contact.isFav };

    // Optimistic UI update (update state immediately before server responds)
    setContacts(contacts.map(c => c.id === contact.id ? updated : c));

    try {
      await fetch(`${API_URL}/${contact.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updated)
      });
    } catch (err) {
      console.warn("Failed to update bookmark on server");
    }
  };

  // --- LOGIC: LOCAL UI ---
  const addMethodField = () => {
    setFormData({
      ...formData,
      methods: [...formData.methods, { type: "Phone", val: "" }]
    });
  };

  const updateMethod = (index, field, value) => {
    const newMethods = [...formData.methods];
    newMethods[index][field] = value;
    setFormData({ ...formData, methods: newMethods });
  };

  const removeMethod = (index) => {
    const newMethods = formData.methods.filter((_, i) => i !== index);
    setFormData({ ...formData, methods: newMethods });
  };

  const openForm = (contact = null) => {
    if (contact) {
      setFormData(contact);
    } else {
      setFormData({
        id: null,
        name: "",
        isFav: showCollection,
        methods: [{ type: "Phone", val: "" }]
      });
    }
    setView("form");
  };

  // --- LOGIC: EXCEL (Kept on Frontend for simplicity) ---
  const handleExport = () => {
    if (!libLoaded) return alert("Excel library loading...");
    const data = contacts.map(c => {
      const row = { "Full Name": c.name, "Is Favorite": c.isFav ? "Yes" : "No" };
      c.methods.forEach((m, i) => {
        row[`Method ${i+1} Type`] = m.type;
        row[`Method ${i+1} Value`] = m.val;
      });
      return row;
    });
    const ws = window.XLSX.utils.json_to_sheet(data);
    const wb = window.XLSX.utils.book_new();
    window.XLSX.utils.book_append_sheet(wb, ws, "Contacts");
    window.XLSX.writeFile(wb, "address_book.xlsx");
  };

  const handleImport = (e) => {
    if (!libLoaded) return alert("Excel library loading...");
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = async (evt) => {
      const bstr = evt.target.result;
      const wb = window.XLSX.read(bstr, { type: 'binary' });
      const wsname = wb.SheetNames[0];
      const data = window.XLSX.utils.sheet_to_json(wb.Sheets[wsname]);

      // Bulk Import Logic: We loop and POST each contact to the backend
      // In a real app, you would send the whole array to a bulk-import endpoint.
      let count = 0;
      for (const row of data) {
        const methods = [];
        let i = 1;
        while(row[`Method ${i} Type`]) {
          methods.push({ type: row[`Method ${i} Type`], val: row[`Method ${i} Value`] || "" });
          i++;
        }

        const newContact = {
          name: row["Full Name"],
          isFav: row["Is Favorite"] === "Yes",
          methods: methods
        };

        // Save to state locally first so user sees it immediately
        setContacts(prev => [...prev, { ...newContact, id: Date.now() + Math.random() }]);

        try {
            await fetch(API_URL, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify(newContact)
            });
        } catch (e) {
            console.warn("Backend offline, imported locally only");
        }
        count++;
      }
      alert(`Imported ${count} contacts!`);
      // fetchContacts(); // Optional: re-fetch to ensure sync
    };
    reader.readAsBinaryString(file);
  };

  // Sort & Filter
  const filteredContacts = contacts
    .filter(c => {
      const matchesSearch = c.name.toLowerCase().includes(search.toLowerCase());
      const matchesCollection = showCollection ? c.isFav : true;
      return matchesSearch && matchesCollection;
    })
    .sort((a, b) => (b.isFav === a.isFav) ? 0 : b.isFav ? 1 : -1);

  // --- RENDER ---
  if (error) return <div className="p-10 text-center text-red-600 font-bold">{error}</div>;

  return (
    <div className="min-h-screen bg-gray-50 text-gray-800 font-sans">

      {/* HEADER */}
      <header className="bg-indigo-600 text-white p-4 shadow-lg sticky top-0 z-10">
        <div className="max-w-3xl mx-auto flex justify-between items-center">
          <h1 className="text-xl font-bold flex items-center gap-2">
            <User className="w-6 h-6" /> XP Address Book (Full Stack)
          </h1>
          <div className="flex gap-2">
             <button onClick={() => { setShowCollection(!showCollection); setView('list'); }} className={`flex items-center gap-1 px-3 py-1 rounded text-sm transition border border-white/20 ${showCollection ? 'bg-yellow-500 text-white font-bold shadow-inner' : 'bg-indigo-500 hover:bg-indigo-400'}`}>
               <Folder className="w-4 h-4" /> {showCollection ? "Exit Collection" : "Collection"}
             </button>
            <label className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-400 px-3 py-1 rounded cursor-pointer text-sm transition">
              <Upload className="w-4 h-4" /> Import
              <input type="file" onChange={handleImport} accept=".xlsx, .xls" className="hidden" />
            </label>
            <button onClick={handleExport} className="flex items-center gap-1 bg-indigo-500 hover:bg-indigo-400 px-3 py-1 rounded text-sm transition">
              <Download className="w-4 h-4" /> Export
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto p-4">
        {loading && <div className="text-center py-4 text-indigo-600 flex items-center justify-center gap-2"><RefreshCw className="animate-spin w-5 h-5"/> Loading data...</div>}

        {!loading && view === 'list' && (
          <>
            {showCollection && (
              <div className="mb-4 p-3 bg-yellow-50 border border-yellow-200 rounded text-yellow-800 flex items-center gap-2">
                <Folder className="w-5 h-5" /> <span className="font-bold">Collection Folder</span>
              </div>
            )}
            <div className="flex gap-2 mb-6">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-2.5 w-5 h-5 text-gray-400" />
                <input type="text" placeholder="Search..." className="w-full pl-10 pr-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500" value={search} onChange={e => setSearch(e.target.value)} />
              </div>
              <button onClick={() => openForm()} className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 flex items-center gap-2 transition">
                <Plus className="w-5 h-5" /> Add
              </button>
            </div>

            <div className="space-y-3">
              {filteredContacts.map(contact => (
                <div key={contact.id} className="bg-white p-4 rounded-lg shadow border border-gray-100 flex justify-between items-start hover:shadow-md transition">
                  <div>
                    <div className="flex items-center gap-2 mb-2">
                      <button onClick={() => toggleFav(contact)} className={`transition ${contact.isFav ? 'text-yellow-400 fill-current' : 'text-gray-300 hover:text-yellow-400'}`}>
                        <Star className="w-6 h-6" fill={contact.isFav ? "currentColor" : "none"} />
                      </button>
                      <h3 className="font-bold text-lg text-gray-800">{contact.name}</h3>
                      {contact.isFav && <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">Collection</span>}
                    </div>
                    <div className="space-y-1 text-sm text-gray-600">
                      {contact.methods.map((m, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <span className="font-medium text-gray-500 w-16">{m.type}:</span> <span>{m.val}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => openForm(contact)} className="text-blue-500 hover:bg-blue-50 p-2 rounded">Edit</button>
                    <button onClick={() => deleteContact(contact.id)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 className="w-4 h-4" /></button>
                  </div>
                </div>
              ))}
              {filteredContacts.length === 0 && <div className="text-center text-gray-400 py-10">No contacts found.</div>}
            </div>
          </>
        )}

        {view === 'form' && (
          <div className="bg-white p-6 rounded-lg shadow-lg">
            <h2 className="text-2xl font-bold mb-4">{formData.id ? 'Edit Contact' : 'New Contact'}</h2>
            <div className="mb-4">
              <label className="block text-sm font-bold mb-1">Full Name</label>
              <input className="w-full border p-2 rounded focus:ring-2 focus:ring-indigo-500 outline-none" value={formData.name} onChange={e => setFormData({...formData, name: e.target.value})} placeholder="Name" />
            </div>
            <div className="mb-6 p-3 bg-yellow-50 border border-yellow-200 rounded flex items-center gap-3">
              <input type="checkbox" id="favCheck" checked={formData.isFav} onChange={e => setFormData({...formData, isFav: e.target.checked})} className="w-5 h-5 text-indigo-600 rounded cursor-pointer" />
              <label htmlFor="favCheck" className="font-bold text-gray-800 cursor-pointer">Add to Collection Folder</label>
            </div>
            <div className="mb-6">
              <label className="block text-sm font-bold mb-2">Contact Methods</label>
              {formData.methods.map((method, idx) => (
                <div key={idx} className="flex gap-2 mb-2">
                  <select className="border p-2 rounded w-1/3 bg-gray-50" value={method.type} onChange={e => updateMethod(idx, 'type', e.target.value)}>
                    <option value="Phone">Phone</option>
                    <option value="Email">Email</option>
                    <option value="Address">Address</option>
                    <option value="WeChat">WeChat</option>
                  </select>
                  <input className="border p-2 rounded flex-1" value={method.val} onChange={e => updateMethod(idx, 'val', e.target.value)} placeholder="Value..." />
                  <button onClick={() => removeMethod(idx)} className="text-red-500 hover:bg-red-50 p-2 rounded"><Trash2 className="w-4 h-4" /></button>
                </div>
              ))}
              <button onClick={addMethodField} className="text-sm text-indigo-600 hover:underline font-medium flex items-center gap-1 mt-2"><Plus className="w-4 h-4" /> Add Method</button>
            </div>
            <div className="flex justify-end gap-2 border-t pt-4">
              <button onClick={() => setView('list')} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded">Cancel</button>
              <button onClick={saveContact} className="px-4 py-2 bg-indigo-600 text-white rounded hover:bg-indigo-700 shadow flex items-center gap-2">Save</button>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}