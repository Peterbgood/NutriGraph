import React, { useState, useEffect, useMemo, useRef } from 'react';
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

  // --- State Hooks ---
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(getLocalDate());
  const [viewingWeekOffset, setViewingWeekOffset] = useState(0);
  const [food, setFood] = useState('');
  const [calories, setCalories] = useState('');
  const [weight, setWeight] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [showWeightLog, setShowWeightLog] = useState(false);
  const [weightRange, setWeightRange] = useState<'1m' | '3m' | '1y'>('3m');
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const formRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const q = query(collection(db, "health_logs"), orderBy("sortOrder", "asc"));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const logData = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })) as HealthLog[];
      setLogs(logData);
    });
    return () => unsubscribe();
  }, []);

  useEffect(() => {
    if (pin === '3270') setIsUnlocked(true);
  }, [pin]);

  const getGoalForDate = (dateStr: string) => {
    const day = new Date(dateStr + 'T00:00:00').getDay();
    return (day === 0 || day === 5 || day === 6) ? 2400 : 1700;
  };

  const dailyTotal = useMemo(() => {
    return logs.filter(l => l.date === selectedDate && l.type === 'food').reduce((s, l) => s + l.calories, 0);
  }, [logs, selectedDate]);

  const rollingSurplus = useMemo(() => {
    const selDateObj = new Date(selectedDate + 'T00:00:00');
    const startOfWeek = new Date(selDateObj);
    const dayNum = selDateObj.getDay(); 
    const diffToMonday = dayNum === 0 ? 6 : dayNum - 1;
    startOfWeek.setDate(selDateObj.getDate() - diffToMonday);

    let net = 0;
    const currentIter = new Date(startOfWeek);
    while (currentIter <= selDateObj) {
      const dStr = getLocalDate(currentIter);
      net += (getGoalForDate(dStr) - logs.filter(l => l.date === dStr && l.type === 'food').reduce((s, l) => s + l.calories, 0));
      currentIter.setDate(currentIter.getDate() + 1);
    }
    return net;
  }, [logs, selectedDate]);

  const records = useMemo(() => {
    const today = new Date();
    const currentWeekStart = new Date(today);
    currentWeekStart.setDate(today.getDate() - (today.getDay() === 0 ? 6 : today.getDay() - 1));
    const currentWeekKey = getLocalDate(currentWeekStart);

    const weekMap: Record<string, number> = {};
    logs.filter(l => l.type === 'food').forEach(l => {
      const d = new Date(l.date + 'T00:00:00');
      const start = new Date(d);
      start.setDate(d.getDate() - (d.getDay() === 0 ? 6 : d.getDay() - 1));
      const weekKey = getLocalDate(start);
      weekMap[weekKey] = (weekMap[weekKey] || 0) + l.calories;
    });

    const totals = Object.values(weekMap);
    const highest = totals.length ? Math.max(...totals) : 0;

    // Filter out the current week for Record Low
    const historicalTotals = Object.entries(weekMap)
      .filter(([key]) => key !== currentWeekKey)
      .map(([_, val]) => val);
    
    const lowest = historicalTotals.length ? Math.min(...historicalTotals) : 0;

    return { highest, lowest };
  }, [logs]);

  const lifetimeWeightRecords = useMemo(() => {
    const weights = logs.filter(l => l.type === 'weight').map(l => l.weight);
    return { min: weights.length ? Math.min(...weights) : 0, max: weights.length ? Math.max(...weights) : 0 };
  }, [logs]);

  const groupedWeights = useMemo(() => {
    const weightLogs = logs.filter(l => l.type === 'weight').sort((a, b) => b.date.localeCompare(a.date));
    const groups: Record<number, { weekNum: number, logs: HealthLog[], min: number, max: number }> = {};
    weightLogs.forEach(l => {
      const date = new Date(l.date + 'T00:00:00');
      const startOfYear = new Date(date.getFullYear(), 0, 1);
      const weekNum = Math.ceil((((date.getTime() - startOfYear.getTime()) / 86400000) + startOfYear.getDay() + 1) / 7);
      if (!groups[weekNum]) groups[weekNum] = { weekNum, logs: [], min: Infinity, max: -Infinity };
      groups[weekNum].logs.push(l);
      groups[weekNum].min = Math.min(groups[weekNum].min, l.weight);
      groups[weekNum].max = Math.max(groups[weekNum].max, l.weight);
    });
    return Object.values(groups).sort((a, b) => b.weekNum - a.weekNum);
  }, [logs]);

  // Handle + / - and manual updates
  const handleSaveFood = async (f: string, c: string | number, delta: number = 0) => {
    if (!f || !c) return;
    const existingEntry = logs.find(l => l.date === selectedDate && l.type === 'food' && l.food.toLowerCase() === f.toLowerCase() && !editingId);

    if (existingEntry && existingEntry.id) {
      const currentCount = existingEntry.count || 1;
      const unitCalories = existingEntry.calories / currentCount;
      const change = delta !== 0 ? delta : 1;
      const newCount = currentCount + change;

      if (newCount <= 0) {
        await deleteDoc(doc(db, "health_logs", existingEntry.id));
      } else {
        await updateDoc(doc(db, "health_logs", existingEntry.id), { 
          count: newCount, 
          calories: Math.round(unitCalories * newCount) 
        });
      }
    } else if (editingId) {
      await updateDoc(doc(db, "health_logs", editingId), { food: f, calories: Number(c) });
      setEditingId(null);
      setFood(''); setCalories('');
    } else {
      const isCoffee = f.toLowerCase().includes('coffee');
      await addDoc(collection(db, "health_logs"), { 
        date: selectedDate, food: f, calories: Number(c), type: 'food', weight: 0, count: 1, 
        sortOrder: isCoffee ? -Date.now() : Date.now() 
      });
    }
    if (!editingId) { setFood(''); setCalories(''); }
  };

  const moveItem = async (id: string, direction: 'up' | 'down') => {
    const dayLogs = logs.filter(l => l.date === selectedDate && l.type === 'food');
    const index = dayLogs.findIndex(l => l.id === id);
    if ((direction === 'up' && index === 0) || (direction === 'down' && index === dayLogs.length - 1)) return;
    const targetIdx = direction === 'up' ? index - 1 : index + 1;
    const current = dayLogs[index]; const target = dayLogs[targetIdx];
    await updateDoc(doc(db, "health_logs", current.id!), { sortOrder: target.sortOrder });
    await updateDoc(doc(db, "health_logs", target.id!), { sortOrder: current.sortOrder });
  };

  const { weekChartData, weeklyAverage, weeklyTotal } = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() - (start.getDay() === 0 ? 6 : start.getDay() - 1) + (viewingWeekOffset * 7));
    const labels = []; const values = []; const colors = [];
    let sum = 0, daysWithLogs = 0;
    for (let i = 0; i < 7; i++) {
      const d = new Date(start); d.setDate(d.getDate() + i);
      const dStr = getLocalDate(d);
      const dayFoodLogs = logs.filter(l => l.date === dStr && l.type === 'food');
      const dayTotal = dayFoodLogs.reduce((s, l) => s + l.calories, 0);
      labels.push(d.toLocaleDateString('en-US', { weekday: 'short' }));
      values.push(dayTotal);
      colors.push(dayTotal > getGoalForDate(dStr) ? '#ef4444' : '#3b82f6');
      if (dayFoodLogs.length > 0) { sum += dayTotal; daysWithLogs++; }
    }
    return { 
      weekChartData: { labels, datasets: [{ data: values, backgroundColor: colors, borderRadius: 6 }] },
      weeklyAverage: daysWithLogs > 0 ? Math.round(sum / daysWithLogs) : 0,
      weeklyTotal: sum
    };
  }, [logs, viewingWeekOffset]);

  const weightTrendData = useMemo(() => {
    const rangeDays = weightRange === '1m' ? 30 : weightRange === '1y' ? 365 : 90;
    const cutOffDate = new Date();
    cutOffDate.setDate(cutOffDate.getDate() - rangeDays);
    const sortedWeights = [...logs]
      .filter(l => l.type === 'weight' && new Date(l.date + 'T00:00:00') >= cutOffDate)
      .sort((a, b) => a.date.localeCompare(b.date));
    return {
      labels: sortedWeights.map(l => l.date.split('-').slice(1).join('/')),
      datasets: [{ 
        data: sortedWeights.map(l => l.weight), borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.05)', 
        fill: true, tension: 0.4, pointRadius: weightRange === '1y' ? 1 : 4, pointBackgroundColor: '#fff', pointBorderWidth: 2 
      }]
    };
  }, [logs, weightRange]);

  const initiateEdit = (log: HealthLog) => {
    setEditingId(log.id!);
    setFood(log.food);
    setCalories(log.calories.toString());
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (pin === '3270') { setIsUnlocked(true); return; }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isUnlocked) return;
      if (e.key >= '0' && e.key <= '9') { if (pin.length < 4) setPin(prev => prev + e.key); }
      else if (e.key === 'Backspace') setPin(prev => prev.slice(0, -1));
      else if (e.key === 'Escape') setPin('');
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [pin, isUnlocked]);

  if (!isUnlocked) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center p-6 font-sans">
        <div className="max-w-sm w-full space-y-8">
          <div className="text-center">
            <h1 className="text-4xl font-semibold tracking-tight italic">NutriGraph<span className="text-blue-600">.</span></h1>
            <p className="text-[10px] font-black text-gray-400 uppercase tracking-[0.2em] mt-2">Secure Terminal Access</p>
          </div>
          <div className="bg-white p-10 rounded-[3rem] shadow-2xl shadow-gray-200/50 border border-white">
            <div className="flex justify-center gap-4 mb-10">
              {[...Array(4)].map((_, i) => (
                <div key={i} className={`w-4 h-4 rounded-full border-2 transition-all duration-300 ${pin.length > i ? 'bg-blue-600 border-blue-600 scale-110' : 'bg-transparent border-gray-200'}`} />
              ))}
            </div>
            <div className="grid grid-cols-3 gap-4">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9].map((num) => (
                <button key={num} onClick={() => pin.length < 4 && setPin(prev => prev + num.toString())} className="h-16 w-16 mx-auto flex items-center justify-center rounded-2xl bg-gray-50 text-xl font-bold text-gray-700 hover:bg-blue-600 hover:text-white active:scale-95 transition-all">{num}</button>
              ))}
              <button onClick={() => setPin('')} className="h-16 w-16 mx-auto flex items-center justify-center rounded-2xl text-[10px] font-black text-gray-400 hover:text-red-500 transition-colors">CLEAR</button>
              <button onClick={() => pin.length < 4 && setPin(prev => prev + '0')} className="h-16 w-16 mx-auto flex items-center justify-center rounded-2xl bg-gray-50 text-xl font-bold text-gray-700 hover:bg-blue-600 hover:text-white active:scale-95 transition-all">0</button>
              <button onClick={() => setPin(prev => prev.slice(0, -1))} className="h-16 w-16 mx-auto flex items-center justify-center rounded-2xl text-[10px] font-black text-gray-400 hover:text-blue-600 transition-colors">DELETE</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans p-4 lg:p-12">
      <div className="max-w-7xl mx-auto space-y-8">
        
        {/* HEADER SECTION */}
        <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row justify-between items-end mb-6 gap-4">
            <div>
              <h1 className="text-4xl font-semibold tracking-tight italic">NutriGraph<span className="text-blue-600">.</span></h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Performance Logistics Dashboard</p>
            </div>
            <div className="flex gap-10 text-right">
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Current In-take</p>
                <span className="text-3xl font-black">{dailyTotal}</span>
                <span className="text-gray-400 font-bold ml-1">/ {getGoalForDate(selectedDate)}</span>
              </div>
              <div>
                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Rolling Surplus</p>
                <span className={`text-3xl font-black ${rollingSurplus < 0 ? 'text-red-500' : 'text-blue-600'}`}>
                  {rollingSurplus > 0 ? `+${rollingSurplus}` : rollingSurplus}
                </span>
                <span className="text-gray-400 font-bold ml-1 text-xs uppercase">Kcal</span>
              </div>
            </div>
          </div>
          <div className="w-full bg-gray-100 h-3 rounded-full overflow-hidden">
            <div className={`h-full transition-all duration-700 ease-out ${dailyTotal > getGoalForDate(selectedDate) ? 'bg-red-500' : 'bg-blue-600'}`} style={{ width: `${Math.min((dailyTotal/getGoalForDate(selectedDate))*100, 100)}%` }} />
          </div>
        </section>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <div className="lg:col-span-8 space-y-8">
            <section className="bg-white rounded-[2.5rem] p-4 shadow-sm border border-gray-100 h-auto min-h-[100px]">
              <div className="flex justify-between items-center mb-8">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Log Breakdown</span>
                <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="text-xs font-bold bg-gray-50 px-4 py-2 rounded-full border-none" />
              </div>
              <div className="space-y-3">
               {logs.filter(l => l.date === selectedDate && l.type === 'food').map((l) => (
  <div 
    key={l.id} 
    className="flex justify-between items-center p-3 md:p-5 bg-gray-50 rounded-3xl group border border-transparent md:hover:border-gray-200 transition-all"
  >
    <div className="flex items-center gap-2 md:gap-4 min-w-0">
      <div className="flex flex-col gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
        <button onClick={() => moveItem(l.id!, 'up')} className="p-1 text-[10px] text-gray-400 hover:text-blue-600 leading-none">▲</button>
        <button onClick={() => moveItem(l.id!, 'down')} className="p-1 text-[10px] text-gray-400 hover:text-blue-600 leading-none">▼</button>
      </div>

      <div className="truncate">
        <div className="font-bold text-sm text-gray-700 truncate">
          {l.food} {l.count && l.count > 1 && (
            <span className="ml-1 text-[9px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full">
              x{l.count}
            </span>
          )}
        </div>
        <div className="text-[9px] font-black text-blue-600 tracking-wider uppercase">
          {l.calories} KCAL
        </div>
      </div>
    </div>

    <div className="flex gap-2 md:gap-4 items-center flex-shrink-0">
      <button 
        onClick={() => initiateEdit(l)} 
        className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-[9px] font-black text-gray-400 hover:text-blue-600 transition-opacity"
      >
        EDIT
      </button>

      <div className="flex items-center bg-white rounded-xl shadow-sm border border-gray-100 p-0.5 md:p-1">
        <button onClick={() => handleSaveFood(l.food, l.calories, -1)} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-gray-400 hover:text-red-500 font-bold">−</button>
        <div className="w-px h-3 bg-gray-100" />
        <button onClick={() => handleSaveFood(l.food, l.calories, 1)} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 font-bold">+</button>
      </div>
    </div>
  </div>
))}
              </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              <section className="bg-white rounded-[2.5rem] p-4 shadow-sm border border-gray-100 h-96 overflow-hidden flex flex-col">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6">Presets</span>
                <div className="overflow-y-auto space-y-6 custom-scrollbar pr-2">
                  {FOOD_PRESETS.map((cat, idx) => (
                    <div key={idx}>
                      <p className="text-[10px] font-black text-gray-300 uppercase mb-3">{cat.category}</p>
                      <div className="flex flex-wrap gap-2">
                        {cat.items.map((item, i) => (
                          <button key={i} onClick={() => handleSaveFood(item.name, item.calories)} className="bg-white border border-gray-100 text-gray-600 px-4 py-2 rounded-xl text-xs font-bold hover:border-blue-600 hover:text-blue-600 transition-all shadow-sm">
                            {item.name} <span className="text-blue-600 ml-1 font-black">{item.calories}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>

              <section ref={formRef} className="bg-[#1d1d1f] rounded-[2.5rem] p-8 shadow-2xl text-white scroll-mt-8">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-8 block">Manual Entry</span>
                <div className="space-y-4">
                  <input value={food} onChange={e => setFood(e.target.value)} placeholder="Fuel Item" className="w-full bg-[#2d2d2f] border-none rounded-2xl p-4 text-sm" />
                  <input type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="Kcal" className="w-full bg-[#2d2d2f] border-none rounded-2xl p-4 text-sm" />
                  <button onClick={() => handleSaveFood(food, calories)} className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl hover:bg-blue-500 transition-all">
                    {editingId ? 'UPDATE ENTRY' : 'ADD TO LOG'}
                  </button>
                  {editingId && (
                    <button onClick={() => { setEditingId(null); setFood(''); setCalories(''); }} className="w-full text-[10px] font-black text-gray-500 uppercase">Cancel Edit</button>
                  )}
                </div>
              </section>
            </div>
          </div>

          {/* SIDEBAR SECTION */}
          <div className="lg:col-span-4 space-y-8">
            <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Weekly Performance</span>
                  <div className="mt-2 flex gap-4">
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase">Avg Daily</p>
                      <span className={`text-xl font-black ${weeklyAverage > 2000 ? 'text-red-500' : 'text-green-500'}`}>
                        {weeklyAverage} <span className="text-[10px] uppercase">Kcal</span>
                      </span>
                    </div>
                    <div>
                      <p className="text-[9px] font-black text-gray-400 uppercase">Week Total</p>
                      <span className="text-xl font-black text-blue-600">
                        {weeklyTotal} <span className="text-[10px] uppercase">Kcal</span>
                      </span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="text-[9px] font-black text-blue-600 uppercase">Record Low: {records.lowest}</div>
                  <div className="text-[9px] font-black text-red-400 uppercase">Record High: {records.highest}</div>
                </div>
              </div>
              <div className="h-48 mb-4">
                <Bar data={weekChartData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: true, grid: { color: '#f9fafb' }, ticks: { font: { size: 9, weight: 'bold' }, color: '#d1d5db', stepSize: 500 } }, x: { grid: { display: false }, ticks: { font: { size: 9, weight: 'bold' } } } } }} />
              </div>
              <div className="flex justify-between items-center bg-gray-50 p-2 rounded-full">
                <button onClick={() => setViewingWeekOffset(v => v - 1)} className="px-4 py-1 text-[10px] font-black hover:bg-white rounded-full">PREV</button>
                <button onClick={() => setViewingWeekOffset(0)} className="px-4 py-1 text-[10px] font-black bg-white shadow-sm rounded-full">NOW</button>
                <button onClick={() => setViewingWeekOffset(v => v + 1)} className="px-4 py-1 text-[10px] font-black hover:bg-white rounded-full">NEXT</button>
              </div>
            </section>

            <section className="bg-white rounded-[2.5rem] p-8 shadow-sm border border-gray-100">
              <div className="flex justify-between items-start mb-6">
                <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Weight Dynamics</span>
                <div className="text-right">
                  <div className="text-[9px] font-black text-blue-600 uppercase">Ever Low: {lifetimeWeightRecords.min}</div>
                  <div className="text-[9px] font-black text-red-400 uppercase">Ever High: {lifetimeWeightRecords.max}</div>
                </div>
              </div>
              <div className="h-40 mb-4"><Line data={weightTrendData} options={{ maintainAspectRatio: false, plugins: { legend: { display: false } }, scales: { y: { display: false }, x: { grid: { display: false } } } }} /></div>
              <div className="flex justify-center gap-2 mb-6 bg-gray-50 p-1 rounded-xl">
                {(['1m', '3m', '1y'] as const).map((r) => (
                  <button key={r} onClick={() => setWeightRange(r)} className={`flex-1 py-1.5 text-[9px] font-black rounded-lg transition-all ${weightRange === r ? 'bg-white shadow-sm text-blue-600' : 'text-gray-400'}`}>{r.toUpperCase()}</button>
                ))}
              </div>
              <div className="flex gap-2 mb-8">
                <input type="number" step="0.1" value={weight} onChange={e => setWeight(e.target.value)} placeholder="Lbs" className="flex-1 bg-gray-50 border-none rounded-2xl p-4 text-sm" />
                <button onClick={async () => { if(!weight) return; await addDoc(collection(db, "health_logs"), { date: selectedDate, food: 'Weight', calories: 0, weight: Number(weight), type: 'weight', sortOrder: Date.now() }); setWeight(''); }} className="bg-blue-600 text-white px-6 rounded-2xl font-bold text-xs">LOG</button>
              </div>
              <div className="space-y-4">
                <button onClick={() => setShowWeightLog(!showWeightLog)} className="w-full py-3 bg-gray-50 text-[10px] font-black uppercase tracking-widest text-gray-400 rounded-2xl hover:bg-gray-100 transition-all">{showWeightLog ? 'Hide Detailed Log' : 'See Detailed Log'}</button>
                {showWeightLog && groupedWeights.map((group) => (
                  <div key={group.weekNum} className="bg-gray-50 rounded-[2rem] p-5 space-y-3">
                    <div className="flex justify-between items-center border-b border-gray-200 pb-2 mb-2">
                      <span className="text-[11px] font-black text-blue-600 uppercase">Week {group.weekNum}</span>
                      <div className="flex gap-3 text-[9px] font-bold">
                        <span className="text-gray-400 uppercase">Min: <span className="text-[#1d1d1f]">{group.min}</span></span>
                        <span className="text-gray-400 uppercase">Max: <span className="text-[#1d1d1f]">{group.max}</span></span>
                      </div>
                    </div>
                    {group.logs.map((w) => (
                      <div key={w.id} className="flex justify-between items-center py-1 group">
                        <div className="flex flex-col">
                          <span className="text-[9px] font-black text-gray-300 uppercase">{new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', { weekday: 'short' })}</span>
                          <span className="text-[10px] font-bold text-gray-500">{new Date(w.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</span>
                        </div>
                        <div className="flex items-center gap-4">
                          <span className="font-black text-xs">{w.weight} <span className="text-[9px] text-gray-300">LB</span></span>
                          <button onClick={() => deleteDoc(doc(db, "health_logs", w.id!))} className="opacity-0 group-hover:opacity-100 text-[10px] font-bold text-red-300 transition-all">✕</button>
                        </div>
                      </div>
                    ))}
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
};

export default CalorieTracker;