import React, { useState, useEffect, useMemo, useRef } from 'react';
import { db } from './firebase';
import { 
  collection, query, onSnapshot, addDoc, 
  deleteDoc, doc, updateDoc, orderBy 
} from "firebase/firestore";
import { HealthLog, PresetCategory } from './types';
import FOOD_PRESETS_DATA from './presets.json';

const FOOD_PRESETS = FOOD_PRESETS_DATA as unknown as PresetCategory[];

const CalorieTracker: React.FC = () => {
  const getLocalDate = (date = new Date()) => date.toLocaleDateString('en-CA');

  // --- State Hooks ---
  const [logs, setLogs] = useState<HealthLog[]>([]);
  const [selectedDate, setSelectedDate] = useState(getLocalDate());
  const [food, setFood] = useState('');
  const [calories, setCalories] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pin, setPin] = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [selectedLogIds, setSelectedLogIds] = useState<string[]>([]);
  const formRef = useRef<HTMLDivElement>(null);

  // --- CSV Export Logic ---
  const handleExport = () => {
    if (logs.length === 0) return;

    const headers = ["Date", "Item", "Calories", "Count"];
    const rows = logs.filter(l => l.type === 'food').map(log => [
      log.date,
      log.food,
      log.calories,
      log.count || 1
    ]);

    const csvContent = [
      headers.join(","),
      ...rows.map(e => e.join(","))
    ].join("\n");

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `nutrigraph_export_${getLocalDate()}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Listen for Ctrl+Shift+E
  useEffect(() => {
    const handleKeyDown: (e: KeyboardEvent) => void = (e) => {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        setShowExport(prev => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  const selectedCalories = useMemo(() => {
    return logs.filter(l => selectedLogIds.includes(l.id!)).reduce((s, l) => s + l.calories, 0);
  }, [logs, selectedLogIds]);

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

  const initiateEdit = (log: HealthLog) => {
    setEditingId(log.id!);
    setFood(log.food);
    setCalories(log.calories.toString());
    formRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    if (pin === '3270') { setIsUnlocked(true); return; }
    const handleKeyPad = (e: KeyboardEvent) => {
      if (isUnlocked) return;
      if (e.key >= '0' && e.key <= '9') { if (pin.length < 4) setPin(prev => prev + e.key); }
      else if (e.key === 'Backspace') setPin(prev => prev.slice(0, -1));
      else if (e.key === 'Escape') setPin('');
    };
    window.addEventListener('keydown', handleKeyPad);
    return () => window.removeEventListener('keydown', handleKeyPad);
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
    <div className="min-h-screen bg-[#f5f5f7] text-[#1d1d1f] font-sans p-4 lg:p-12 relative">
      {/* FLOATING SELECTED CALORIES BUTTON */}
      {selectedLogIds.length > 0 && (
        <div className={`fixed z-50 flex items-center bg-blue-600 text-white px-6 py-4 rounded-full font-black text-[10px] tracking-widest shadow-2xl border-2 border-white gap-4 ${showExport ? 'bottom-24' : 'bottom-8'} right-8`}>
          <span>{selectedCalories} KCAL SELECTED</span>
          <button 
            onClick={() => setSelectedLogIds([])}
            className="bg-white text-blue-600 px-2.5 py-1 rounded-full text-[8px] hover:bg-gray-100 transition-all cursor-pointer"
          >
            CLEAR
          </button>
        </div>
      )}

      {/* HIDDEN EXPORT BUTTON - TRIGGERED BY CTRL+SHIFT+E */}
      {showExport && (
        <div className="fixed bottom-8 right-8 z-50 animate-bounce">
          <button 
            onClick={handleExport}
            className="bg-black text-white px-8 py-4 rounded-full font-black text-[10px] tracking-widest shadow-2xl hover:bg-blue-600 transition-all border-2 border-white"
          >
            EXPORT DATABASE (.CSV)
          </button>
        </div>
      )}

      <div className="max-w-4xl mx-auto space-y-8">
        {/* HEADER SECTION */}
        <section className="bg-white rounded-[2.5rem] p-6 md:p-8 shadow-sm border border-gray-100">
          <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-6 gap-6">
            <div>
              <h1 className="text-3xl md:text-4xl font-semibold tracking-tight italic">NutriGraph<span className="text-blue-600">.</span></h1>
              <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest">Daily Calorie Log</p>
            </div>

            <input type="date" value={selectedDate} onChange={e => setSelectedDate(e.target.value)} className="text-xs font-bold bg-gray-50 px-4 py-2 rounded-full border-none" />
          </div>

          <div className="flex justify-between w-full gap-6 mb-6">
            <div className="flex-1">
              <p className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">Used</p>
              <span className="text-2xl md:text-3xl font-black">{dailyTotal}</span>
              <span className="text-gray-400 font-bold ml-1 text-[10px] md:text-base">/{getGoalForDate(selectedDate)}</span>
            </div>

            <div className="flex-1 text-right">
              <p className="text-[8px] md:text-[10px] font-black text-gray-400 uppercase tracking-widest leading-tight">Remaining</p>
              <span className={`text-2xl md:text-3xl font-black ${getGoalForDate(selectedDate) - dailyTotal < 0 ? 'text-red-500' : 'text-green-500'}`}>
                {getGoalForDate(selectedDate) - dailyTotal}
              </span>
            </div>
          </div>

          <div className="w-full bg-gray-100 h-2 md:h-3 rounded-full overflow-hidden">
            <div 
              className={`h-full transition-all duration-700 ease-out ${dailyTotal > getGoalForDate(selectedDate) ? 'bg-red-500' : 'bg-blue-600'}`} 
              style={{ width: `${Math.min((dailyTotal / getGoalForDate(selectedDate)) * 100, 100)}%` }} 
            />
          </div>
        </section>

        {/* LOG BREAKDOWN */}
        <section className="bg-white rounded-[2.5rem] p-4 shadow-sm border border-gray-100 h-auto min-h-[100px]">
          <div className="flex justify-between items-center mb-8 px-2">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400">Log Breakdown</span>
          </div>
          <div className="space-y-3">
           {logs.filter(l => l.date === selectedDate && l.type === 'food').map((l) => {
             const isSelected = selectedLogIds.includes(l.id!);
             return (
              <div 
                key={l.id} 
                onClick={() => {
                  if (isSelected) {
                    setSelectedLogIds(selectedLogIds.filter(id => id !== l.id));
                  } else {
                    setSelectedLogIds([...selectedLogIds, l.id!]);
                  }
                }}
                className={`flex justify-between items-center p-3 md:p-5 rounded-3xl group border cursor-pointer transition-all ${
                  isSelected 
                  ? 'bg-blue-50 border-blue-300' 
                  : 'bg-gray-50 border-transparent md:hover:border-gray-200'
                }`}
              >
                <div className="flex items-center gap-2 md:gap-4 min-w-0">
                  <div className="flex flex-col gap-0.5 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                    <button onClick={(e) => { e.stopPropagation(); moveItem(l.id!, 'up'); }} className="p-1 text-[10px] text-gray-400 hover:text-blue-600 leading-none">▲</button>
                    <button onClick={(e) => { e.stopPropagation(); moveItem(l.id!, 'down'); }} className="p-1 text-[10px] text-gray-400 hover:text-blue-600 leading-none">▼</button>
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
                  <button onClick={(e) => { e.stopPropagation(); initiateEdit(l); }} className="opacity-100 md:opacity-0 md:group-hover:opacity-100 text-[9px] font-black text-gray-400 hover:text-blue-600 transition-opacity">EDIT</button>
                  <div className="flex items-center bg-white rounded-xl shadow-sm border border-gray-100 p-0.5 md:p-1">
                    <button onClick={(e) => { e.stopPropagation(); handleSaveFood(l.food, l.calories, -1); }} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-gray-400 hover:text-red-500 font-bold">−</button>
                    <div className="w-px h-3 bg-gray-100" />
                    <button onClick={(e) => { e.stopPropagation(); handleSaveFood(l.food, l.calories, 1); }} className="w-7 h-7 md:w-8 md:h-8 flex items-center justify-center text-gray-400 hover:text-blue-600 font-bold">+</button>
                  </div>
                </div>
              </div>
             );
           })}
          </div>
        </section>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <section className="bg-white rounded-[2.5rem] p-4 shadow-sm border border-gray-100 h-96 overflow-hidden flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest text-gray-400 mb-6 px-2">Presets</span>
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
            <form onSubmit={(e) => { e.preventDefault(); handleSaveFood(food, calories); }} className="space-y-4">
              <input value={food} onChange={e => setFood(e.target.value)} placeholder="Fuel Item" className="w-full bg-[#2d2d2f] border-none rounded-2xl p-4 text-sm text-white" />
              <input type="number" value={calories} onChange={e => setCalories(e.target.value)} placeholder="Kcal" className="w-full bg-[#2d2d2f] border-none rounded-2xl p-4 text-sm text-white" />
              <button type="submit" className="w-full bg-blue-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl hover:bg-blue-500 transition-all">
                {editingId ? 'UPDATE ENTRY' : 'ADD TO LOG'}
              </button>
              {editingId && (
                <button type="button" onClick={() => { setEditingId(null); setFood(''); setCalories(''); }} className="w-full text-[10px] font-black text-gray-500 uppercase">Cancel Edit</button>
              )}
            </form>
          </section>
        </div>
      </div>
    </div>
  );
};

export default CalorieTracker;