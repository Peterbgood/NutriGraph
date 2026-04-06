import React, { useState, useEffect, useMemo } from 'react';
import { db } from './firebase';
import { 
  collection, query, onSnapshot, addDoc, 
  deleteDoc, doc, updateDoc, orderBy 
} from "firebase/firestore";
import { 
  Chart as ChartJS, CategoryScale, LinearScale, BarElement, 
  Title, Tooltip, Legend, LineElement, PointElement, Filler 
} from 'chart.js';
import { Bar, Line } from 'react-chartjs-2';
import { HealthLog, PresetCategory } from './types';
import FOOD_PRESETS_DATA from './presets.json';

const FOOD_PRESETS = FOOD_PRESETS_DATA as unknown as PresetCategory[];

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Tooltip, Legend, Filler);

const CalorieTracker: React.FC = () => {
  const getLocalDate = (date = new Date()) => date.toLocaleDateString('en-CA');

  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(getLocalDate());
  const [viewingWeekOffset, setViewingWeekOffset] = useState(0);
  const [food, setFood] = useState('');
  const [calories, setCalories] = useState('');
  const [weight, setWeight] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showFullWeightHistory, setShowFullWeightHistory] = useState(false);

  useEffect(() => {
    const q = query(collection(db, "health_logs"), orderBy("sortOrder", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HealthLog[];
      setLogs(logData);
    });
    return () => unsubscribe();
  }, []);

  // --- Logic for Reordering (Mobile Friendly) ---
  const moveItem = async (id: string, direction: 'up' | 'down') => {
    const currentDayLogs = logs.filter(l => l.date === selectedDate && l.type === 'food');
    const index = currentDayLogs.findIndex(l => l.id === id);
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === currentDayLogs.length - 1)) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const currentItem = currentDayLogs[index];
    const targetItem = currentDayLogs[targetIndex];

    await updateDoc(doc(db, "health_logs", currentItem.id!), { sortOrder: targetItem.sortOrder });
    await updateDoc(doc(db, "health_logs", targetItem.id!), { sortOrder: currentItem.sortOrder });
  };

  const handleSaveFood = async (f: string, c: string | number) => {
    if (!f || !c) return;
    const isCoffee = f.toLowerCase().includes('coffee');
    
    if (editingId) {
      await updateDoc(doc(db, "health_logs", editingId), { 
        food: f, 
        calories: Number(c) 
      });
      setEditingId(null);
    } else {
      await addDoc(collection(db, "health_logs"), {
        date: selectedDate, food: f, calories: Number(c), type: 'food', weight: 0, sortOrder: isCoffee ? -Date.now() : Date.now()
      });
    }
    setFood(''); setCalories('');
  };

  const startEdit = (log: HealthLog) => {
    setEditingId(log.id!);
    setFood(log.food);
    setCalories(log.calories.toString());
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // --- Chart Data ---
  const chartData = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - (start.getDay() === 0 ? 6 : start.getDay() - 1) + (viewingWeekOffset * 7));
    const labels = [];
    const calorieValues = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const dateStr = getLocalDate(d);
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
      calorieValues.push(logs.filter(l => l.date === dateStr && l.type === 'food').reduce((sum, l) => sum + l.calories, 0));
    }
    return { labels, datasets: [{ label: 'Kcal', data: calorieValues, backgroundColor: '#3b82f6', borderRadius: 12 }] };
  }, [logs, viewingWeekOffset]);

  const weightHistory = useMemo(() => {
    const weightEntries = logs.filter(l => l.type === 'weight').sort((a, b) => b.date.localeCompare(a.date));
    return showFullWeightHistory ? weightEntries : weightEntries.slice(0, 21);
  }, [logs, showFullWeightHistory]);

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] p-4 lg:p-12 font-sans">
      <div className="max-w-7xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* HEADER */}
        <div className="lg:col-span-12 flex justify-between items-end mb-4">
          <div>
            <h1 className="text-4xl font-semibold tracking-tight">NutriGraph<span className="text-blue-600">.</span></h1>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-[0.2em]">Precision Logistics</p>
          </div>
          <div className="flex bg-white rounded-full p-1 shadow-sm border border-gray-100">
            <button onClick={() => setViewingWeekOffset(v => v - 1)} className="px-4 py-1 text-[10px] font-black hover:bg-gray-50 rounded-full">PREV</button>
            <button onClick={() => setViewingWeekOffset(0)} className="px-4 py-1 text-[10px] font-black bg-gray-100 rounded-full">CURRENT</button>
            <button onClick={() => setViewingWeekOffset(v => v + 1)} className="px-4 py-1 text-[10px] font-black hover:bg-gray-50 rounded-full">NEXT</button>
          </div>
        </div>

        {/* COLUMN 1: INPUT & PRESETS */}
        <div className="lg:col-span-4 space-y-6">
          <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50">
            <div className="flex justify-between items-center mb-6">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Entry</span>
              <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="text-xs font-bold border-none bg-gray-50 rounded-lg" />
            </div>
            <div className="space-y-3">
              <input value={food} onChange={e => setFood(e.target.value)} placeholder="Fuel Item" className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-blue-500" />
              <input type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="Kcal" className="w-full bg-gray-50 border-none rounded-2xl p-4 text-sm focus:ring-2 focus:ring-blue-500" />
              <button onClick={() => handleSaveFood(food, calories)} className="w-full bg-[#1d1d1f] text-white py-4 rounded-2xl font-bold text-sm hover:scale-[1.01] transition-all">
                {editingId ? 'Update Entry' : 'Log Entry'}
              </button>
              {editingId && <button onClick={() => {setEditingId(null); setFood(''); setCalories('');}} className="w-full text-[10px] font-bold text-gray-400 uppercase">Cancel Edit</button>}
            </div>
          </section>

          <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50 max-h-[500px] overflow-hidden flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">Presets</span>
            <div className="overflow-y-auto space-y-6 pr-2 custom-scrollbar">
              {FOOD_PRESETS.map((cat, idx) => (
                <div key={idx}>
                  <p className="text-[11px] font-bold text-gray-300 mb-3 border-b border-gray-50 pb-1">{cat.category}</p>
                  <div className="flex flex-wrap gap-2">
                    {cat.items.map((item, i) => (
                      <button key={i} onClick={() => handleSaveFood(item.name, item.calories)} className="bg-blue-50/50 text-blue-700 px-4 py-2 rounded-xl text-xs font-semibold border border-blue-100/30 hover:bg-blue-100 transition-all">
                        {item.name} <span className="opacity-40 ml-1">{item.calories}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* COLUMN 2: DAILY LOG & EDITING */}
        <div className="lg:col-span-4">
          <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50 h-full flex flex-col min-h-[600px]">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">Daily Breakdown</span>
            <div className="flex-1 space-y-3 overflow-y-auto">
              {logs.filter(l => l.date === selectedDate && l.type === 'food').map((l) => (
                <div key={l.id} className="flex justify-between items-center p-5 bg-gray-50 rounded-3xl group border border-transparent hover:border-gray-200 transition-all">
                  <div className="flex items-center gap-4">
                    <div className="flex flex-col gap-1 opacity-20 group-hover:opacity-100">
                      <button onClick={() => moveItem(l.id!, 'up')} className="text-[10px] hover:text-blue-600">▲</button>
                      <button onClick={() => moveItem(l.id!, 'down')} className="text-[10px] hover:text-blue-600">▼</button>
                    </div>
                    <div>
                      <div className="font-bold text-sm">{l.food}</div>
                      <div className="text-[10px] text-blue-600 font-black">{l.calories} KCAL</div>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => startEdit(l)} className="text-[10px] font-bold text-gray-400 hover:text-blue-600">EDIT</button>
                    <button onClick={() => deleteDoc(doc(db, "health_logs", l.id!))} className="text-[10px] font-bold text-gray-400 hover:text-red-500">DELETE</button>
                  </div>
                </div>
              ))}
            </div>
          </section>
        </div>

        {/* COLUMN 3: WEIGHT LOG & ANALYTICS */}
        <div className="lg:col-span-4 space-y-6">
          <div className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50 h-64">
            <Bar data={chartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false } } } }} />
          </div>

          <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-50">
            <div className="flex gap-2 mb-8">
              <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Weight (Lbs)" className="flex-1 bg-gray-50 border-none rounded-2xl p-4 text-sm" />
              <button onClick={async () => {
                if(!weight) return;
                await addDoc(collection(db, "health_logs"), { date: getLocalDate(), food: 'Weight Log', calories: 0, weight: Number(weight), type: 'weight', sortOrder: Date.now() });
                setWeight('');
              }} className="bg-blue-600 text-white px-6 rounded-2xl font-bold text-xs">Log</button>
            </div>
            <div className="space-y-1">
              {weightHistory.map((w, i) => {
                const isMonday = new Date(w.date + 'T00:00:00').getDay() === 1;
                return (
                  <div key={i} className={`flex justify-between items-center py-3 px-2 group ${isMonday ? 'mt-6 border-t border-gray-100 pt-6' : ''}`}>
                    <div className="flex flex-col">
                      <span className="text-[10px] font-black text-gray-300 uppercase">{new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span>
                      <span className="text-xs font-bold text-gray-500">{new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="font-black text-sm">{w.weight} <span className="text-[10px] text-gray-300">LB</span></span>
                      <button onClick={() => deleteDoc(doc(db, "health_logs", w.id!))} className="opacity-0 group-hover:opacity-100 text-[10px] font-black text-red-300 hover:text-red-600 transition-all">✕</button>
                    </div>
                  </div>
                );
              })}
              <button onClick={() => setShowFullWeightHistory(!showFullWeightHistory)} className="w-full mt-6 py-3 text-[10px] font-black text-gray-300 uppercase tracking-[0.2em] hover:text-blue-600 transition-colors">
                {showFullWeightHistory ? 'View Recent' : 'Expand Full History'}
              </button>
            </div>
          </section>
        </div>

      </div>
    </div>
  );
};

export default CalorieTracker;