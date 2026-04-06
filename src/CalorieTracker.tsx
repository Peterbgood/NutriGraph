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
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const getDailyGoal = (dateString: string) => {
    const day = new Date(dateString + 'T00:00:00').getDay();
    return (day === 0 || day === 6) ? 2400 : 1700;
  };

  useEffect(() => {
    const q = query(collection(db, "health_logs"), orderBy("sortOrder", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HealthLog[];
      setLogs(logData);
    });
    return () => unsubscribe();
  }, []);

  const handleSaveFood = async (inputFood: string, inputCals: string | number) => {
    if (!inputFood || !inputCals) return;
    const name = inputFood.trim();
    const cals = Number(inputCals);
    const existingEntry = logs.find(l => l.date === selectedDate && l.food.toLowerCase() === name.toLowerCase() && l.type === 'food');
    
    const isCoffee = name.toLowerCase().includes('coffee');
    const newSortOrder = isCoffee ? -Math.abs(Date.now()) : Date.now();

    if (editingId) {
      await updateDoc(doc(db, "health_logs", editingId), { food: name, calories: cals });
      setEditingId(null);
    } else if (existingEntry && existingEntry.id) {
      await updateDoc(doc(db, "health_logs", existingEntry.id), { calories: existingEntry.calories + cals });
    } else {
      await addDoc(collection(db, "health_logs"), {
        date: selectedDate, food: name, calories: cals, type: 'food', weight: 0, sortOrder: newSortOrder 
      });
    }
    setFood(''); setCalories('');
  };

  const weeklyStats = useMemo(() => {
    const now = new Date();
    now.setDate(now.getDate() + (viewingWeekOffset * 7));
    const dayOfWeek = now.getDay();
    const diffToMonday = now.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    const monday = new Date(new Date(now).setDate(diffToMonday));

    const week = [];
    let totalCals = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(monday);
      d.setDate(monday.getDate() + i);
      const dateStr = d.toLocaleDateString('en-CA');
      const dayLogs = logs.filter(l => l.date === dateStr && l.type === 'food');
      const dailyTotal = dayLogs.reduce((a, c) => a + c.calories, 0);
      totalCals += dailyTotal;
      week.push({ label: d.toLocaleDateString('en-US', { weekday: 'short', day: 'numeric' }), total: dailyTotal, goal: getDailyGoal(dateStr) });
    }
    return { week, average: Math.round(totalCals / 7), rangeLabel: `${week[0].label} - ${week[6].label}` };
  }, [logs, viewingWeekOffset]);

  const dailyLogs = useMemo(() => logs.filter(l => l.date === selectedDate && l.type === 'food'), [logs, selectedDate]);
  const weightLogs = useMemo(() => logs.filter(l => l.type === 'weight').sort((a,b) => a.date.localeCompare(b.date)), [logs]);
  const usedToday = dailyLogs.reduce((a, c) => a + c.calories, 0);
  const currentGoal = getDailyGoal(selectedDate);

  const changeDay = (offset: number) => {
    const d = new Date(selectedDate + 'T00:00:00');
    d.setDate(d.getDate() + offset);
    setSelectedDate(getLocalDate(d));
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans p-4 md:p-8">
      <div className="max-w-3xl mx-auto space-y-10">
        
        {/* 1. DAILY PROGRESS */}
        <section className="space-y-4">
          <div className="flex justify-between items-end">
            <div className="flex items-center gap-3">
              <button onClick={() => changeDay(-1)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400">◀</button>
              <h1 className="text-4xl font-black tracking-tighter italic">TODAY<span className="text-blue-600">.</span></h1>
              <button onClick={() => changeDay(1)} className="p-2 hover:bg-slate-200 rounded-lg transition-colors text-slate-400">▶</button>
            </div>
            <div className="text-right">
              <span className="text-3xl font-black">{usedToday}</span>
              <span className="text-slate-400 font-bold ml-1">/ {currentGoal}</span>
            </div>
          </div>
          <div className="w-full bg-slate-200 h-4 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-700 ease-out ${usedToday > currentGoal ? 'bg-red-500' : 'bg-blue-600'}`} 
              style={{ width: `${Math.min((usedToday/currentGoal)*100, 100)}%` }}
            />
          </div>
        </section>

        {/* 2. DAILY LOG */}
        <section className="space-y-3">
          <div className="flex justify-between items-center">
            <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Log Breakdown</h3>
            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="bg-transparent border-none text-blue-600 font-bold cursor-pointer focus:ring-0" />
          </div>
          <div className="bg-white rounded-3xl shadow-sm border border-slate-100 divide-y divide-slate-50">
            {dailyLogs.length === 0 ? (
              <p className="p-8 text-center text-slate-400 italic text-sm">No fuel recorded for this date.</p>
            ) : (
              dailyLogs.map(l => (
                <div key={l.id} className="flex justify-between items-center p-4 hover:bg-slate-50/50 transition-colors">
                  <div className="flex items-center gap-4">
                    <div className="w-10 h-10 flex items-center justify-center bg-slate-50 rounded-xl text-xl">
                      {l.food.toLowerCase().includes('coffee') ? '☕' : '🍴'}
                    </div>
                    <div>
                      <div className="font-bold text-slate-700">{l.food}</div>
                      <div className="text-sm font-black text-blue-600">{l.calories} kcal</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    {deleteConfirmId === l.id ? (
                      <button onClick={() => { deleteDoc(doc(db, "health_logs", l.id!)); setDeleteConfirmId(null); }} className="bg-red-500 text-white text-[10px] font-black px-3 py-1.5 rounded-full hover:bg-red-600 transition-all">CONFIRM</button>
                    ) : (
                      <>
                        <button onClick={() => { setEditingId(l.id!); setFood(l.food); setCalories(l.calories.toString()); window.scrollTo({top: 1000, behavior: 'smooth'}); }} className="p-2 text-slate-300 hover:text-blue-600 transition-colors">✎</button>
                        <button onClick={() => { setDeleteConfirmId(l.id!); setTimeout(() => setDeleteConfirmId(null), 3000); }} className="p-2 text-slate-300 hover:text-red-500 transition-colors">✕</button>
                      </>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        {/* 3. PRESETS */}
        <section className="space-y-3">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Quick-Add Presets</h3>
          <div className="bg-white rounded-3xl p-5 shadow-sm border border-slate-100 max-h-[500px] overflow-y-auto space-y-6 custom-scrollbar">
            {FOOD_PRESETS.map((cat, idx) => (
              <div key={idx} className="space-y-2">
                <p className="text-[10px] font-black text-slate-300 uppercase tracking-tighter flex items-center gap-2">
                  <span className="w-4 h-[1px] bg-slate-200"></span>{cat.category}
                </p>
                <div className="flex flex-wrap gap-2">
                  {cat.items.map((item, i) => (
                    <button key={i} onClick={() => handleSaveFood(item.name, item.calories)} className="bg-white border border-slate-100 px-4 py-2 rounded-xl text-sm font-bold shadow-sm hover:border-blue-600 hover:text-blue-600 transition-all">
                      {item.name} <span className="text-blue-300 ml-1 font-black">{item.calories}</span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* 4. MANUAL ENTRY */}
        <section className="bg-slate-900 rounded-3xl p-6 shadow-xl space-y-4">
          <h3 className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-500">{editingId ? 'Edit Active Entry' : 'Manual Entry'}</h3>
          <div className="flex flex-col md:flex-row gap-3">
            <input value={food} onChange={e => setFood(e.target.value)} placeholder="What did you eat?" className="flex-1 bg-slate-800 border-none rounded-xl p-3 text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-600" />
            <input type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="kcal" className="w-full md:w-24 bg-slate-800 border-none rounded-xl p-3 text-white focus:ring-2 focus:ring-blue-600" />
            <button onClick={() => handleSaveFood(food, calories)} className={`px-6 py-3 rounded-xl font-black transition-all ${editingId ? 'bg-orange-500 hover:bg-orange-600' : 'bg-blue-600 hover:bg-blue-700'} text-white`}>
              {editingId ? 'UPDATE' : 'ADD'}
            </button>
          </div>
        </section>

        {/* 5. WEEKLY CHART */}
        <section className="space-y-4">
          <div className="flex justify-between items-center">
            <div>
              <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Weekly Performance</h3>
              <p className="text-[10px] text-slate-400 font-bold uppercase">{weeklyStats.rangeLabel}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-black bg-blue-100 text-blue-700 px-2 py-1 rounded-md">AVG: {weeklyStats.average}</span>
              <div className="flex bg-white rounded-lg p-1 border border-slate-100 shadow-sm">
                <button onClick={() => setViewingWeekOffset(v => v - 1)} className="px-3 py-1 text-[10px] font-black hover:bg-slate-50 rounded">PREV</button>
                <button onClick={() => setViewingWeekOffset(0)} className="px-3 py-1 text-[10px] font-black hover:bg-slate-50 rounded">NOW</button>
                <button onClick={() => setViewingWeekOffset(v => v + 1)} className="px-3 py-1 text-[10px] font-black hover:bg-slate-50 rounded border-l">NEXT</button>
              </div>
            </div>
          </div>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 h-48">
            <Bar 
              data={{
                labels: weeklyStats.week.map(d => d.label),
                datasets: [{ data: weeklyStats.week.map(d => d.total), backgroundColor: weeklyStats.week.map(d => d.total > d.goal ? '#ef4444' : '#3b82f6'), borderRadius: 8 }]
              }}
              options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false }, border: { display: false } } } }}
            />
          </div>
        </section>

        {/* 6. WEIGHT TRACKING */}
        <section className="space-y-4 pb-20">
          <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">Weight Trend</h3>
          <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100 h-48 mb-4">
            <Line 
              data={{
                labels: weightLogs.map(l => l.date.split('-').slice(1).join('/')),
                datasets: [{ data: weightLogs.map(l => l.weight), borderColor: '#3b82f6', tension: 0.4, fill: true, backgroundColor: 'rgba(59, 130, 246, 0.05)', pointRadius: 4, pointBackgroundColor: '#3b82f6' }]
              }}
              options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { grid: { color: '#f1f5f9' } }, x: { grid: { display: false } } } }}
            />
          </div>
          <div className="bg-blue-50 rounded-3xl p-6 border border-blue-100 flex gap-3 items-center">
            <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Log current lbs..." className="flex-1 bg-white border-blue-200 rounded-xl p-3 focus:ring-2 focus:ring-blue-600" />
            <button onClick={async () => {
               if(!weight) return;
               await addDoc(collection(db, "health_logs"), { date: getLocalDate(), food: 'Weight Entry', calories: 0, weight: Number(weight), type: 'weight', sortOrder: Date.now() });
               setWeight('');
            }} className="bg-slate-900 text-white px-6 py-3 rounded-xl font-black hover:bg-black transition-all">UPDATE</button>
          </div>
        </section>

      </div>
    </div>
  );
};

export default CalorieTracker;