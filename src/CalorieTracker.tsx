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

  const dailyGoal = useMemo(() => {
    const day = new Date(selectedDate + 'T00:00:00').getDay();
    return (day === 0 || day === 6) ? 2400 : 1700;
  }, [selectedDate]);

  const dailyTotal = useMemo(() => {
    return logs.filter(l => l.date === selectedDate && l.type === 'food').reduce((s, l) => s + l.calories, 0);
  }, [logs, selectedDate]);

  const handleSaveFood = async (f: string, c: string | number) => {
    if (!f || !c) return;
    if (editingId) {
      await updateDoc(doc(db, "health_logs", editingId), { food: f, calories: Number(c) });
      setEditingId(null);
    } else {
      const isCoffee = f.toLowerCase().includes('coffee');
      await addDoc(collection(db, "health_logs"), {
        date: selectedDate, food: f, calories: Number(c), type: 'food', weight: 0, sortOrder: isCoffee ? -Date.now() : Date.now()
      });
    }
    setFood(''); setCalories('');
  };

  const weekChartData = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - (start.getDay() === 0 ? 6 : start.getDay() - 1) + (viewingWeekOffset * 7));
    const labels = []; const values = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
      values.push(logs.filter(l => l.date === getLocalDate(d) && l.type === 'food').reduce((s, l) => s + l.calories, 0));
    }
    return { labels, datasets: [{ data: values, backgroundColor: '#3b82f6', borderRadius: 8 }] };
  }, [logs, viewingWeekOffset]);

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans p-4 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* --- DESKTOP HEADER & PROGRESS BAR --- */}
        <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight italic">NutriGraph<span className="text-blue-600">.</span></h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Performance Logistics Dashboard</p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black">{dailyTotal}</span>
              <span className="text-gray-400 font-bold ml-1">/ {dailyGoal} KCAL</span>
            </div>
          </div>
          {/* High-End Linear Progress Bar */}
          <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-1000 ease-out ${dailyTotal > dailyGoal ? 'bg-red-500' : 'bg-blue-600'}`} 
              style={{ width: `${Math.min((dailyTotal/dailyGoal)*100, 100)}%` }}
            />
          </div>
        </section>

        {/* --- MAIN GRID LAYOUT --- */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* LEFT COLUMN: LOG & PRESETS */}
          <div className="lg:col-span-8 space-y-8">
            
            {/* DAILY LOG */}
            <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 min-h-[400px]">
              <div className="flex justify-between items-center mb-8">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Daily Log Breakdown</span>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="text-xs font-bold bg-gray-50 px-4 py-2 rounded-full border-none" />
              </div>
              <div className="space-y-3">
                {logs.filter(l => l.date === selectedDate && l.type === 'food').map((l) => (
                  <div key={l.id} className="flex justify-between items-center p-5 bg-gray-50 rounded-3xl group border border-transparent hover:border-gray-200 transition-all">
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 flex items-center justify-center bg-white rounded-xl text-lg shadow-sm">
                        {l.food.toLowerCase().includes('coffee') ? '☕' : '🍴'}
                      </div>
                      <div>
                        <div className="font-bold text-sm text-gray-700">{l.food}</div>
                        <div className="text-[10px] font-black text-blue-600 tracking-wider">{l.calories} KCAL</div>
                      </div>
                    </div>
                    <div className="flex gap-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => { setEditingId(l.id!); setFood(l.food); setCalories(l.calories.toString()); }} className="text-[10px] font-black text-gray-400 hover:text-blue-600">EDIT</button>
                      <button onClick={() => deleteDoc(doc(db, "health_logs", l.id!))} className="text-[10px] font-black text-gray-400 hover:text-red-500">DELETE</button>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            {/* PRESETS & MANUAL ENTRY ROW */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100 h-96 overflow-hidden flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">Presets</span>
                <div className="overflow-y-auto space-y-6 custom-scrollbar pr-2">
                  {FOOD_PRESETS.map((cat, idx) => (
                    <div key={idx}>
                      <p className="text-[10px] font-black text-gray-300 uppercase mb-3">{cat.category}</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.items.map((item, i) => (
                          <button key={i} onClick={() => handleSaveFood(item.name, item.calories)} className="bg-white border border-gray-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm">
                            {item.name} <span className="text-blue-300 ml-1 font-black">{item.calories}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section className="bg-[#1d1d1f] rounded-[2.5rem] p-8 shadow-2xl text-white">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-8 block">Manual Entry</span>
                <div className="space-y-4">
                  <input value={food} onChange={e => setFood(e.target.value)} placeholder="Fuel Item" className="w-full bg-[#2d2d2f] border-none rounded-2xl p-4 text-sm" />
                  <input type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="Kcal" className="w-full bg-[#2d2d2f] border-none rounded-2xl p-4 text-sm" />
                  <button onClick={() => handleSaveFood(food, calories)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-blue-900/20 hover:bg-blue-500 transition-all">
                    {editingId ? 'UPDATE LOG' : 'ADD TO DAY'}
                  </button>
                </div>
              </section>
            </div>
          </div>

          {/* RIGHT COLUMN: ANALYTICS & WEIGHT */}
          <div className="lg:col-span-4 space-y-8">
            
            {/* WEEKLY CHART CARD */}
            <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-center mb-6">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Week Performance</span>
                <div className="flex bg-gray-50 p-1 rounded-full border border-gray-100">
                  <button onClick={() => setViewingWeekOffset(v => v - 1)} className="px-3 py-1 text-[10px] font-black hover:bg-white rounded-full">←</button>
                  <button onClick={() => setViewingWeekOffset(0)} className="px-3 py-1 text-[10px] font-black bg-white shadow-sm rounded-full mx-1">NOW</button>
                  <button onClick={() => setViewingWeekOffset(v => v + 1)} className="px-3 py-1 text-[10px] font-black hover:bg-white rounded-full">→</button>
                </div>
              </div>
              <div className="h-48 mb-6">
                <Bar data={weekChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false } } } }} />
              </div>
              <div className="pt-4 border-t border-gray-50 flex justify-between items-center">
                <span className="text-[10px] font-black text-gray-400 uppercase">Weekly Average</span>
                <span className="text-xl font-bold">{(weekChartData.datasets[0].data.reduce((a,b)=>a+b,0)/7).toFixed(0)} <span className="text-[10px] text-blue-600">KCAL</span></span>
              </div>
            </section>

            {/* WEIGHT SECTION */}
            <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
              <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 block">Biometrics</span>
              <div className="flex gap-2 mb-8">
                <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Lbs" className="flex-1 bg-gray-50 border-none rounded-2xl p-4 text-sm" />
                <button onClick={async () => {
                  if(!weight) return;
                  await addDoc(collection(db, "health_logs"), { date: getLocalDate(), food: 'Weight Log', calories: 0, weight: Number(weight), type: 'weight', sortOrder: Date.now() });
                  setWeight('');
                }} className="bg-blue-600 text-white px-6 rounded-2xl font-bold text-xs shadow-lg shadow-blue-100">LOG</button>
              </div>
              <div className="space-y-1">
                {logs.filter(l => l.type === 'weight').sort((a,b) => b.date.localeCompare(a.date)).slice(0, showFullWeightHistory ? 100 : 7).map((w, i) => {
                  const isMonday = new Date(w.date + 'T00:00:00').getDay() === 1;
                  return (
                    <div key={i} className={`flex justify-between items-center py-3 px-2 group ${isMonday ? 'mt-6 border-t border-gray-100 pt-6' : ''}`}>
                      <div className="flex flex-col">
                        <span className="text-[10px] font-black text-gray-300 uppercase">{new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span>
                        <span className="text-xs font-bold text-gray-500">{new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                      </div>
                      <div className="flex items-center gap-4">
                        <span className="font-black text-sm">{w.weight} <span className="text-[10px] text-gray-300">LB</span></span>
                        <button onClick={() => deleteDoc(doc(db, "health_logs", w.id!))} className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-red-300 hover:text-red-500 transition-all">✕</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

          </div>
        </div>
      </div>
    </div>
  );
};

export default CalorieTracker;