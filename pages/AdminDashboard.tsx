import React, { useState, useMemo } from 'react';
import { AttendanceRecord, AttendanceStatus, Teacher, AppSettings, SchoolEvent, ScheduleEntry } from './types';
import { CLASSES, CLASS_COLORS, TEACHERS as INITIAL_TEACHERS, SCHEDULE as INITIAL_SCHEDULE, MAPEL_NAME_MAP, TEACHER_COLORS } from '../constants';
import { 
  Users, LayoutGrid, Calendar, Activity, Settings, ShieldCheck, BookOpen, Save, CheckCircle2, RefreshCw, 
  Wifi, BarChart3, AlertTriangle, Clock, Search, BookText, Plus, Trash2, CalendarDays, TrendingUp, UserCheck,
  Edit3, Coffee, Filter, PieChart as PieIcon, ChevronDown
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { spreadsheetService } from './spreadsheetService';

interface AdminDashboardProps {
  data: AttendanceRecord[];
  teachers: Teacher[];
  setTeachers: (val: Teacher[] | ((prev: Teacher[]) => Teacher[])) => void;
  schedule: ScheduleEntry[];
  setSchedule: (val: ScheduleEntry[] | ((prev: ScheduleEntry[]) => ScheduleEntry[])) => void;
  settings: AppSettings;
  setSettings: (val: AppSettings | ((prev: AppSettings) => AppSettings)) => void;
  onSaveAttendance: (records: AttendanceRecord[]) => void;
}

type AdminTab = 'overview' | 'monitoring' | 'permits' | 'agenda' | 'teachers' | 'schedule' | 'settings';
type TimeFilter = 'harian' | 'mingguan' | 'bulanan' | 'semester';

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  data, teachers, schedule, settings, setSettings, onSaveAttendance 
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('harian');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`);
  const [isRestoring, setIsRestoring] = useState(false);
  const [searchTeacher, setSearchTeacher] = useState('');
  const [scheduleDay, setScheduleDay] = useState('SENIN');

  // Deep Dive Selection States
  const [selectedClassId, setSelectedClassId] = useState(CLASSES[0].id);
  const [selectedTeacherId, setSelectedTeacherId] = useState(teachers[0]?.id || '');

  // Agenda State
  const [newEvent, setNewEvent] = useState<Partial<SchoolEvent>>({
    tanggal: new Date().toISOString().split('T')[0],
    nama: '',
    tipe: 'LIBUR',
    affected_jams: []
  });

  const [permitForm, setPermitForm] = useState({
    id: '', // For editing
    date: new Date().toISOString().split('T')[0],
    teacherId: '',
    status: AttendanceStatus.IZIN,
    note: 'Izin keperluan keluarga',
    type: 'FULL_DAY',
    affected_jams: [] as string[]
  });

  const todayStr = new Date().toISOString().split('T')[0];

  const getPeriodsForDate = (dateStr: string) => {
    const d = new Date(dateStr);
    const dayNames = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU'];
    const targetDay = dayNames[d.getDay()];
    const daySlots = schedule.filter(s => s.hari === targetDay);
    if (daySlots.length === 0) return [];
    return daySlots.map(s => s.jam).sort((a, b) => parseInt(a) - parseInt(b));
  };

  const filteredRecords = useMemo(() => {
    const now = new Date();
    return (data || []).filter(record => {
      const recordDate = new Date(record.tanggal);
      if (timeFilter === 'harian') return record.tanggal === todayStr;
      if (timeFilter === 'mingguan') return (now.getTime() - recordDate.getTime()) <= 7 * 24 * 60 * 60 * 1000;
      if (timeFilter === 'bulanan') {
        const monthStr = recordDate.getMonth() + 1 < 10 ? `0${recordDate.getMonth() + 1}` : `${recordDate.getMonth() + 1}`;
        return monthStr === selectedMonth && recordDate.getFullYear() === now.getFullYear();
      }
      return true;
    });
  }, [data, timeFilter, selectedMonth, todayStr]);

  // Deep Dive Data Memoization
  const classDeepDiveData = useMemo(() => {
    const filtered = filteredRecords.filter(r => r.id_kelas === selectedClassId);
    const performance: Record<string, any> = {};
    filtered.forEach(r => {
      if (!performance[r.nama_guru]) performance[r.nama_guru] = { name: r.nama_guru, Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0 };
      const key = r.status === AttendanceStatus.TIDAK_HADIR ? 'Alpha' : r.status;
      if (performance[r.nama_guru][key] !== undefined) performance[r.nama_guru][key]++;
    });
    return Object.values(performance);
  }, [filteredRecords, selectedClassId]);

  const teacherDeepDiveData = useMemo(() => {
    const teacherRecords = filteredRecords.filter(r => r.id_guru === selectedTeacherId);
    const classGroups: Record<string, any> = {};
    teacherRecords.forEach(r => {
      if (!classGroups[r.id_kelas]) classGroups[r.id_kelas] = { name: r.id_kelas, Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0 };
      const statusKey = r.status === AttendanceStatus.TIDAK_HADIR ? 'Alpha' : r.status;
      classGroups[r.id_kelas][statusKey]++;
    });
    
    const total = teacherRecords.length;
    const hadir = teacherRecords.filter(r => r.status === AttendanceStatus.HADIR).length;
    const accuracy = total > 0 ? Math.round((hadir / total) * 100) : 0;

    return {
      distribution: Object.values(classGroups),
      stats: { total, hadir, accuracy, records: teacherRecords }
    };
  }, [filteredRecords, selectedTeacherId]);

  // Fix: Added missing permitHistory memoized data for riwayat izin view
  const permitHistory = useMemo(() => {
    return (data || [])
      .filter(r => r.is_admin_input)
      .sort((a, b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime());
  }, [data]);

  const stats = {
    hadir: filteredRecords.filter(r => r.status === AttendanceStatus.HADIR).length,
    izin: filteredRecords.filter(r => r.status === AttendanceStatus.IZIN || r.status === AttendanceStatus.SAKIT).length,
    alpha: filteredRecords.filter(r => r.status === AttendanceStatus.TIDAK_HADIR).length,
    total: filteredRecords.length
  };

  const handleApplyPermit = async () => {
    if (!permitForm.teacherId || !permitForm.date) return;
    const d = new Date(permitForm.date);
    const dayNames = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU'];
    const selectedDay = dayNames[d.getDay()];
    let teacherSchedule = schedule.filter(s => s.hari === selectedDay && s.kegiatan === 'KBM');
    
    if (permitForm.type === 'SPECIFIC_HOURS') {
      if (permitForm.affected_jams.length === 0) { alert('Pilih jam mengajar!'); return; }
      teacherSchedule = teacherSchedule.filter(s => permitForm.affected_jams.includes(s.jam));
    }

    const records: AttendanceRecord[] = [];
    const teacher = teachers.find(t => t.id === permitForm.teacherId);
    
    teacherSchedule.forEach(slot => {
      CLASSES.forEach(cls => {
        const mapping = slot.mapping[cls.id];
        if (mapping && mapping.split('-')[1] === permitForm.teacherId) {
          records.push({
            id: `${permitForm.date}-${cls.id}-${slot.jam}`,
            id_guru: permitForm.teacherId,
            nama_guru: teacher?.nama || permitForm.teacherId,
            mapel: mapping.split('-')[0],
            id_kelas: cls.id,
            tanggal: permitForm.date,
            jam: slot.jam,
            status: permitForm.status,
            catatan: permitForm.note,
            is_admin_input: true
          });
        }
      });
    });

    if (records.length === 0) { alert('Tidak ada jadwal guru tersebut!'); return; }
    await onSaveAttendance(records);
    alert('Izin berhasil diperbarui di Cloud!');
    setPermitForm({ id: '', date: todayStr, teacherId: '', status: AttendanceStatus.IZIN, note: 'Izin keperluan keluarga', type: 'FULL_DAY', affected_jams: [] });
  };

  const handleEditPermit = (rec: AttendanceRecord) => {
    setActiveTab('permits');
    setPermitForm({
      id: rec.id,
      date: rec.tanggal,
      teacherId: rec.id_guru,
      status: rec.status,
      note: rec.catatan || '',
      type: 'SPECIFIC_HOURS',
      affected_jams: [rec.jam]
    });
  };

  const handleDeletePermit = async (rec: AttendanceRecord) => {
    if (!confirm('Hapus laporan absensi ini?')) return;
    const success = await spreadsheetService.deleteRecord('attendance', rec.id);
    if (success) {
      alert('Berhasil dihapus. Silakan refresh data.');
    }
  };

  const handleAddEvent = async () => {
    if (!newEvent.nama || !newEvent.tanggal) return;
    if (newEvent.tipe === 'JAM_KHUSUS' && (!newEvent.affected_jams || newEvent.affected_jams.length === 0)) {
      alert('Pilih jam terdampak!'); return;
    }
    const event = { ...newEvent, id: newEvent.id || Date.now().toString() } as SchoolEvent;
    const isEdit = !!newEvent.id;
    const updatedEvents = isEdit 
      ? (settings.events || []).map(e => e.id === event.id ? event : e)
      : [...(settings.events || []), event];
    
    const success = await spreadsheetService.saveRecord('settings', { ...settings, events: updatedEvents });
    if (success) {
      setSettings(prev => ({ ...prev, events: updatedEvents }));
      setNewEvent({ tanggal: todayStr, nama: '', tipe: 'LIBUR', affected_jams: [] });
      alert(isEdit ? 'Agenda diperbarui!' : 'Agenda ditambahkan!');
    }
  };

  const handleEditEvent = (ev: SchoolEvent) => {
    setNewEvent(ev);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  // Fix: Added missing handleDeleteEvent function to allow removing agenda items
  const handleDeleteEvent = async (id: string) => {
    if (!confirm('Hapus agenda ini?')) return;
    const updatedEvents = (settings.events || []).filter(e => e.id !== id);
    const success = await spreadsheetService.saveRecord('settings', { ...settings, events: updatedEvents });
    if (success) {
      setSettings(prev => ({ ...prev, events: updatedEvents }));
      alert('Agenda berhasil dihapus dari Cloud!');
    }
  };

  const handleRestoreDefaults = async () => {
    if (!confirm('Pindahkan data master statis ke Google Spreadsheet?')) return;
    setIsRestoring(true);
    try {
      for (const t of INITIAL_TEACHERS) { await spreadsheetService.saveRecord('teachers', t); }
      for (const s of INITIAL_SCHEDULE) { await spreadsheetService.saveRecord('schedule', s); }
      await spreadsheetService.saveRecord('settings', { id: 'settings', ...settings });
      alert('Master data disinkronkan.');
    } finally { setIsRestoring(false); }
  };

  const toggleEventJam = (jam: string) => {
    const current = newEvent.affected_jams || [];
    const updated = current.includes(jam) ? current.filter(j => j !== jam) : [...current, jam];
    setNewEvent({ ...newEvent, affected_jams: updated });
  };

  const eventDayName = useMemo(() => {
    if (!newEvent.tanggal) return '';
    const dayNames = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU'];
    return dayNames[new Date(newEvent.tanggal).getDay()];
  }, [newEvent.tanggal]);

  const todaySchedule = useMemo(() => {
    const days = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU'];
    const today = days[new Date().getDay()];
    return schedule.filter(s => s.hari === today);
  }, [schedule]);

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight uppercase italic">Control <span className="text-indigo-600">Center</span></h1>
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] italic">Database Integrasi • SMPN 3 Pacet</p>
        </div>
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm flex overflow-x-auto no-scrollbar gap-1">
          {[
            { id: 'overview', icon: <LayoutGrid size={16}/>, label: 'Ikhtisar' },
            { id: 'monitoring', icon: <Activity size={16}/>, label: 'Live' },
            { id: 'permits', icon: <ShieldCheck size={16}/>, label: 'Izin' },
            { id: 'agenda', icon: <CalendarDays size={16}/>, label: 'Agenda' },
            { id: 'teachers', icon: <Users size={16}/>, label: 'Guru' },
            { id: 'schedule', icon: <BookOpen size={16}/>, label: 'Jadwal' },
            { id: 'settings', icon: <Settings size={16}/>, label: 'Sistem' }
          ].map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all shrink-0 ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Hadir', val: stats.hadir, color: 'emerald', icon: <CheckCircle2 size={18}/> },
              { label: 'Izin', val: stats.izin, color: 'indigo', icon: <ShieldCheck size={18}/> },
              { label: 'Alpha', val: stats.alpha, color: 'rose', icon: <AlertTriangle size={18}/> },
              { label: 'Cloud Total', val: stats.total, color: 'slate', icon: <Wifi size={18}/> }
            ].map((s, i) => (
              <div key={i} className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm flex items-center gap-3">
                <div className={`p-3 rounded-2xl bg-${s.color}-50 text-${s.color}-600`}>{s.icon}</div>
                <div><p className="text-[8px] font-black text-slate-400 uppercase italic leading-none mb-1">{s.label}</p><h3 className="text-lg font-black text-slate-800">{s.val}</h3></div>
              </div>
            ))}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            {/* DEEP DIVE PER KELAS */}
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-2xl relative">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
                 <div className="flex items-center gap-3"><BarChart3 size={20} className="text-indigo-600"/><h3 className="text-xs font-black uppercase italic text-slate-800">Analisis Per Kelas</h3></div>
                 <div className="relative group">
                    <select className="appearance-none bg-slate-50 border border-slate-100 pl-6 pr-10 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-50 min-w-[140px] italic cursor-pointer" value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
                       {CLASSES.map(c => <option key={c.id} value={c.id}>KELAS {c.id}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                 </div>
              </div>

              <div className="h-72 mb-10">
                {classDeepDiveData.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={classDeepDiveData}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} tick={{fill: '#94a3b8', fontSize: 8, fontWeight: 'black'}} axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 'black'}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Legend iconType="circle" wrapperStyle={{fontSize: 9, fontWeight: 'bold'}} />
                      <Bar dataKey="Hadir" fill="#10b981" radius={[4, 4, 0, 0]} barSize={12} />
                      <Bar dataKey="Izin" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={12} />
                      <Bar dataKey="Sakit" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={12} />
                      <Bar dataKey="Alpha" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={12} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                     <AlertTriangle className="text-slate-300 mb-3" size={32}/>
                     <p className="text-[10px] font-black uppercase text-slate-400 italic">Tidak ada data untuk filter periode ini</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                <p className="text-[9px] font-black uppercase text-slate-400 italic mb-2 tracking-widest flex items-center gap-2"><Clock size={12}/> Live Jadwal {selectedClassId}</p>
                {todaySchedule.map(item => {
                  const mapping = (item.mapping && item.mapping[selectedClassId]) || '';
                  const [mapel, teacherId] = mapping.includes('-') ? mapping.split('-') : [mapping, ''];
                  const teacher = teachers.find(t => t.id === teacherId);
                  const recorded = filteredRecords.find(d => d.tanggal === todayStr && d.id_kelas === selectedClassId && d.jam === item.jam);
                  return (
                    <div key={item.jam} className={`p-4 rounded-2xl border flex items-center justify-between transition-all ${item.kegiatan !== 'KBM' ? 'bg-slate-50 border-slate-50 opacity-50' : recorded ? 'bg-white border-indigo-100 shadow-sm' : 'bg-slate-50/30 border-dashed border-slate-200'}`}>
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 rounded-xl bg-slate-100 flex items-center justify-center text-[10px] font-black italic">{item.jam}</span>
                        <div>
                          <p className="text-[10px] font-black uppercase tracking-tight leading-none mb-1 text-slate-800">{item.kegiatan === 'KBM' ? (MAPEL_NAME_MAP[mapel] || mapel) : item.kegiatan}</p>
                          <p className="text-[8px] font-bold text-slate-400 uppercase italic tracking-widest">{teacher?.nama || '-'}</p>
                        </div>
                      </div>
                      {recorded && <span className={`px-3 py-1 rounded-full text-[8px] font-black uppercase tracking-widest ${recorded.status === AttendanceStatus.HADIR ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>{recorded.status}</span>}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* DEEP DIVE PER GURU */}
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-2xl overflow-hidden">
               <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-6 mb-10">
                 <div className="flex items-center gap-3"><UserCheck size={20} className="text-indigo-600"/><h3 className="text-xs font-black uppercase italic text-slate-800">Analisis Per Guru</h3></div>
                 <div className="relative group">
                    <select className="appearance-none bg-slate-50 border border-slate-100 pl-6 pr-10 py-3 rounded-2xl text-[10px] font-black uppercase outline-none focus:ring-4 focus:ring-indigo-50 min-w-[180px] italic cursor-pointer" value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}>
                       {teachers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                    </select>
                    <ChevronDown size={14} className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
                 </div>
              </div>

              <div className="grid grid-cols-3 gap-4 mb-10">
                {[
                  { label: 'Total Jam', val: teacherDeepDiveData.stats.total, bg: 'bg-indigo-50', color: 'indigo' },
                  { label: 'Kehadiran', val: teacherDeepDiveData.stats.hadir, bg: 'bg-emerald-50', color: 'emerald' },
                  { label: 'Akurasi', val: `${teacherDeepDiveData.stats.accuracy}%`, bg: 'bg-slate-900', color: 'white' }
                ].map((s, i) => (
                  <div key={i} className={`p-4 rounded-3xl ${s.bg} border border-slate-100 text-center`}>
                    <p className={`text-[8px] font-black uppercase italic mb-1 ${s.color === 'white' ? 'text-slate-400' : `text-${s.color}-600`}`}>{s.label}</p>
                    <h4 className={`text-lg font-black ${s.color === 'white' ? 'text-white' : 'text-slate-800'}`}>{s.val}</h4>
                  </div>
                ))}
              </div>

              <div className="flex items-center gap-3 mb-6"><PieIcon size={16} className="text-slate-400"/><p className="text-[10px] font-black uppercase italic text-slate-800">Distribusi Kelas ({timeFilter})</p></div>
              <div className="h-72 mb-10">
                {teacherDeepDiveData.distribution.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={teacherDeepDiveData.distribution}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                      <XAxis dataKey="name" tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'black'}} axisLine={false} tickLine={false} />
                      <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 'black'}} />
                      <Tooltip cursor={{fill: '#f8fafc'}} />
                      <Bar dataKey="Hadir" fill="#10b981" radius={[4, 4, 0, 0]} barSize={25} />
                      <Bar dataKey="Alpha" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={25} />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex flex-col items-center justify-center text-center p-10 bg-slate-50/50 rounded-3xl border border-dashed border-slate-200">
                     <AlertTriangle className="text-slate-300 mb-3" size={32}/>
                     <p className="text-[10px] font-black uppercase text-slate-400 italic">Guru belum memiliki riwayat mengajar</p>
                  </div>
                )}
              </div>

              <div className="space-y-3">
                 <p className="text-[9px] font-black uppercase text-slate-400 italic mb-2 tracking-widest flex items-center gap-2"><BookOpen size={12}/> Riwayat Terbaru {teachers.find(t=>t.id===selectedTeacherId)?.nama.split(',')[0]}</p>
                 {teacherDeepDiveData.stats.records.slice(-5).reverse().map((r, i) => (
                   <div key={i} className="flex items-center justify-between p-4 rounded-2xl bg-slate-50/30 border border-slate-100 hover:bg-white hover:shadow-sm transition-all group">
                      <div className="flex items-center gap-3">
                         <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-[10px] font-black ${CLASS_COLORS[r.id_kelas]}`}>{r.id_kelas}</div>
                         <div>
                            <p className="text-[10px] font-black uppercase tracking-tight leading-none mb-1 text-slate-800">{r.mapel}</p>
                            <p className="text-[8px] font-bold text-slate-400 uppercase italic tracking-widest">{r.tanggal} • JAM {r.jam}</p>
                         </div>
                      </div>
                      <span className={`text-[9px] font-black italic uppercase ${r.status === AttendanceStatus.HADIR ? 'text-emerald-500' : 'text-rose-500'}`}>{r.status}</span>
                   </div>
                 ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MONITORING TAB */}
      {activeTab === 'monitoring' && (
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-2xl overflow-hidden">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-xs font-black uppercase italic tracking-widest">Live Monitoring Cloud</h3>
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span className="text-[9px] font-black text-emerald-600 uppercase italic">Sinkron Otomatis</span></div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead><tr className="bg-slate-50/50"><th className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase">Jam</th><th className="px-4 py-6 text-[9px] font-black text-slate-400 uppercase">Kelas</th><th className="px-4 py-6 text-[9px] font-black text-slate-400 uppercase">Guru</th><th className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {(filteredRecords || []).filter(r => r.tanggal === todayStr).length === 0 ? (
                  <tr><td colSpan={4} className="py-20 text-center text-[10px] font-black uppercase text-slate-400 italic">Belum ada laporan masuk hari ini</td></tr>
                ) : (
                  (filteredRecords || []).filter(r => r.tanggal === todayStr).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-8 py-6 text-xs font-black text-slate-500 italic">Jam {r.jam}</td>
                      <td className="px-4 py-6"><span className={`px-3 py-1 rounded-lg text-[10px] font-black ${CLASS_COLORS[r.id_kelas]}`}>{r.id_kelas}</span></td>
                      <td className="px-4 py-6 text-xs font-black uppercase tracking-tight">{r.nama_guru}</td>
                      <td className="px-8 py-6"><span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase ${r.status === AttendanceStatus.HADIR ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{r.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* PERMITS TAB */}
      {activeTab === 'permits' && (
        <div className="max-w-5xl mx-auto space-y-8 animate-in slide-in-from-bottom-6">
           <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl relative overflow-hidden">
              <h3 className="text-sm font-black uppercase italic mb-8 flex items-center gap-4"><ShieldCheck size={24} className="text-indigo-600"/> {permitForm.id ? 'Perbarui Izin/Sakit' : 'Input Izin Baru'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8 relative z-10">
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic">Tanggal</label><input type="date" className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black text-xs outline-none focus:bg-white" value={permitForm.date} onChange={e => setPermitForm({...permitForm, date: e.target.value, affected_jams: []})}/></div>
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic">Pilih Guru</label><select className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black text-xs outline-none focus:bg-white uppercase" value={permitForm.teacherId} onChange={e => setPermitForm({...permitForm, teacherId: e.target.value})}><option value="">-- Pilih Guru --</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}</select></div>
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic">Status</label><select className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black text-xs outline-none focus:bg-white" value={permitForm.status} onChange={e => setPermitForm({...permitForm, status: e.target.value as any})}><option value={AttendanceStatus.IZIN}>IZIN</option><option value={AttendanceStatus.SAKIT}>SAKIT</option></select></div>
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic">Jangkauan</label><select className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black text-xs outline-none focus:bg-white" value={permitForm.type} onChange={e => setPermitForm({...permitForm, type: e.target.value as any, affected_jams: []})}><option value="FULL_DAY">SATU HARI PENUH</option><option value="SPECIFIC_HOURS">JAM TERTENTU</option></select></div>
              </div>
              {permitForm.type === 'SPECIFIC_HOURS' && (
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8">
                   <p className="text-[10px] font-black text-slate-400 mb-4 uppercase italic flex items-center gap-2"><Clock size={14}/> Pilih Jam Mengajar:</p>
                   <div className="grid grid-cols-4 md:grid-cols-8 gap-3">
                      {getPeriodsForDate(permitForm.date).map(jam => (
                        <label key={jam} className={`flex flex-col items-center p-3 rounded-2xl border cursor-pointer transition-all ${permitForm.affected_jams.includes(jam) ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg' : 'bg-white text-slate-400 border-slate-200'}`}>
                           <input type="checkbox" className="hidden" checked={permitForm.affected_jams.includes(jam)} onChange={e => { const updated = e.target.checked ? [...permitForm.affected_jams, jam] : permitForm.affected_jams.filter(j => j !== jam); setPermitForm({...permitForm, affected_jams: updated}); }}/>
                           <span className="text-xs font-black uppercase">Jam {jam}</span>
                        </label>
                      ))}
                   </div>
                </div>
              )}
              <div className="flex gap-4">
                 <button onClick={handleApplyPermit} className="flex-1 bg-indigo-600 text-white font-black py-6 rounded-3xl shadow-xl hover:bg-indigo-700 transition-all text-[11px] uppercase tracking-widest flex items-center justify-center gap-4 active:scale-95"><Save size={20}/> {permitForm.id ? 'Perbarui Data' : 'Terbitkan Izin'}</button>
                 {permitForm.id && <button onClick={() => setPermitForm({ id: '', date: todayStr, teacherId: '', status: AttendanceStatus.IZIN, note: 'Izin keperluan keluarga', type: 'FULL_DAY', affected_jams: [] })} className="bg-slate-200 text-slate-600 font-black px-8 rounded-3xl text-[10px] uppercase">Batal</button>}
              </div>
           </div>

           <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl">
              <h3 className="text-sm font-black uppercase italic mb-8 flex items-center gap-4 text-slate-800"><Activity size={24} className="text-indigo-600"/> Riwayat Izin & Aksi</h3>
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                {permitHistory.length === 0 ? (
                  <div className="py-10 text-center text-[10px] font-black uppercase text-slate-400 italic">Belum ada riwayat izin</div>
                ) : (
                  permitHistory.map((rec, i) => (
                    <div key={rec.id} className="flex items-center justify-between p-6 rounded-[28px] bg-slate-50/50 border border-slate-100 hover:border-indigo-100 transition-all group">
                      <div className="flex items-center gap-5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${rec.status === AttendanceStatus.SAKIT ? 'bg-amber-100 text-amber-600' : 'bg-blue-100 text-blue-600'}`}>
                          {rec.status === AttendanceStatus.SAKIT ? 'S' : 'I'}
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-800 tracking-tight italic">{rec.nama_guru}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{rec.tanggal} • JAM {rec.jam} • {rec.id_kelas}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <button onClick={() => handleEditPermit(rec)} className="p-3 bg-white text-indigo-500 rounded-xl border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-indigo-50"><Edit3 size={16}/></button>
                         <button onClick={() => handleDeletePermit(rec)} className="p-3 bg-white text-rose-500 rounded-xl border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-rose-50"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
           </div>
        </div>
      )}

      {/* AGENDA TAB */}
      {activeTab === 'agenda' && (
        <div className="max-w-5xl mx-auto space-y-8 animate-in slide-in-from-bottom-6">
           <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl">
              <h3 className="text-sm font-black uppercase italic mb-8 flex items-center gap-4 text-slate-800"><CalendarDays size={24} className="text-indigo-600"/> {newEvent.id ? 'Perbarui Agenda' : 'Kelola Agenda Sekolah'}</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic">Tanggal Agenda</label><input type="date" className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black text-xs outline-none focus:bg-white" value={newEvent.tanggal} onChange={e => setNewEvent({...newEvent, tanggal: e.target.value, affected_jams: []})}/></div>
                 <div className="md:col-span-2"><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic">Nama Kegiatan / Libur</label><input type="text" placeholder="MISAL: LIBUR SEMESTER, RAPAT DINAS, DLL" className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black text-xs outline-none focus:bg-white uppercase italic" value={newEvent.nama} onChange={e => setNewEvent({...newEvent, nama: e.target.value})}/></div>
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic">Tipe Agenda</label><select className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black text-xs outline-none focus:bg-white" value={newEvent.tipe} onChange={e => setNewEvent({...newEvent, tipe: e.target.value as any, affected_jams: []})}>
                    <option value="LIBUR">HARI LIBUR</option>
                    <option value="KEGIATAN">KEGIATAN SEKOLAH</option>
                    <option value="JAM_KHUSUS">JAM KHUSUS</option>
                 </select></div>
              </div>

              {newEvent.tipe === 'JAM_KHUSUS' && (
                <div className="bg-slate-50 p-8 rounded-[32px] border border-indigo-100 mb-8 animate-in zoom-in-95 duration-300">
                   <div className="flex items-center justify-between mb-6">
                      <div className="flex items-center gap-3">
                         <div className="p-2 bg-indigo-100 text-indigo-600 rounded-lg"><Clock size={18}/></div>
                         <div>
                            <p className="text-[11px] font-black uppercase italic text-slate-800">Pilih Jam Terdampak</p>
                            <p className="text-[9px] font-bold uppercase text-slate-400 tracking-widest">JADWAL HARI {eventDayName}</p>
                         </div>
                      </div>
                   </div>
                   <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-9 gap-3">
                      {getPeriodsForDate(newEvent.tanggal || todayStr).map(jam => (
                        <button key={jam} onClick={() => toggleEventJam(jam)} className={`flex flex-col items-center justify-center p-4 rounded-2xl border-2 transition-all active:scale-90 ${newEvent.affected_jams?.includes(jam) ? 'bg-indigo-600 border-indigo-700 text-white shadow-lg' : 'bg-white border-slate-200 text-slate-400 hover:border-indigo-200'}`}>
                           <span className="text-[10px] font-black uppercase">Jam</span><span className="text-lg font-black">{jam}</span>
                        </button>
                      ))}
                   </div>
                </div>
              )}

              <div className="flex gap-4">
                 <button onClick={handleAddEvent} className="flex-1 bg-slate-900 text-white font-black py-6 rounded-3xl shadow-xl hover:bg-slate-800 transition-all text-[11px] uppercase tracking-widest flex items-center justify-center gap-4 active:scale-95"><Plus size={20}/> {newEvent.id ? 'Simpan Perubahan' : 'Terbitkan Agenda'}</button>
                 {newEvent.id && <button onClick={() => setNewEvent({ tanggal: todayStr, nama: '', tipe: 'LIBUR', affected_jams: [] })} className="bg-slate-100 text-slate-500 font-black px-8 rounded-3xl text-[10px] uppercase">Batal</button>}
              </div>
           </div>

           <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl">
              <h3 className="text-sm font-black uppercase italic mb-8 flex items-center gap-4 text-slate-800"><BookText size={24} className="text-indigo-600"/> Agenda Cloud Terdaftar</h3>
              <div className="space-y-4 max-h-[500px] overflow-y-auto pr-4 custom-scrollbar">
                {(settings.events || []).length === 0 ? (
                  <div className="py-10 text-center text-[10px] font-black uppercase text-slate-400 italic">Belum ada agenda</div>
                ) : (
                  [...(settings.events || [])].sort((a,b) => new Date(b.tanggal).getTime() - new Date(a.tanggal).getTime()).map((ev, i) => (
                    <div key={ev.id} className="flex items-center justify-between p-6 rounded-[28px] bg-slate-50/50 border border-slate-100 group">
                      <div className="flex items-center gap-5">
                        <div className={`w-12 h-12 rounded-2xl flex items-center justify-center shrink-0 ${ev.tipe === 'LIBUR' ? 'bg-rose-100 text-rose-600' : ev.tipe === 'KEGIATAN' ? 'bg-emerald-100 text-emerald-600' : 'bg-amber-100 text-amber-600'}`}>
                          <Calendar size={20} />
                        </div>
                        <div>
                          <p className="text-xs font-black uppercase text-slate-800 tracking-tight italic">{ev.nama}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mt-0.5">{ev.tanggal} • {ev.tipe} {ev.tipe === 'JAM_KHUSUS' && `(Jam: ${ev.affected_jams?.join(', ')})`}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                         <button onClick={() => handleEditEvent(ev)} className="p-3 bg-white text-indigo-500 rounded-xl border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-indigo-50"><Edit3 size={16}/></button>
                         <button onClick={() => handleDeleteEvent(ev.id)} className="p-3 bg-white text-rose-500 rounded-xl border border-slate-100 opacity-0 group-hover:opacity-100 transition-opacity shadow-sm hover:bg-rose-50"><Trash2 size={16}/></button>
                      </div>
                    </div>
                  ))
                )}
              </div>
           </div>
        </div>
      )}

      {/* OTHER TABS (TEACHERS, SCHEDULE, SETTINGS) */}
      {activeTab === 'teachers' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6">
           <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                 <h3 className="text-sm font-black uppercase italic flex items-center gap-3 text-slate-800"><Users size={24} className="text-indigo-600"/> Data Guru Tersinkron</h3>
                 <div className="relative"><Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/><input type="text" placeholder="CARI NAMA GURU..." className="pl-12 pr-6 py-3.5 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 min-w-[280px]" value={searchTeacher} onChange={e => setSearchTeacher(e.target.value)}/></div>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead><tr className="border-b border-slate-50"><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Kode</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Nama Lengkap</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Mata Pelajaran</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                       {teachers.filter(t => t.nama.toLowerCase().includes(searchTeacher.toLowerCase())).map(t => (
                         <tr key={t.id} className="hover:bg-slate-50/50">
                            <td className="px-4 py-5"><span className="text-[10px] font-black px-2 py-1 bg-slate-100 rounded-md">{t.id}</span></td>
                            <td className="px-4 py-5 text-xs font-black uppercase text-slate-800 tracking-tight">{t.nama}</td>
                            <td className="px-4 py-5">
                               <div className="flex flex-wrap gap-2">
                                  {(Array.isArray(t.mapel) ? t.mapel : (typeof t.mapel === 'string' ? (t.mapel as string).split(',').map(s => s.trim()) : [])).map((m, i) => (
                                    <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[9px] font-black uppercase tracking-tighter">
                                      {m}
                                    </span>
                                  ))}
                               </div>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'schedule' && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6">
           <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-8">
                 <h3 className="text-sm font-black uppercase italic flex items-center gap-3 text-slate-800"><BookText size={24} className="text-indigo-600"/> Jadwal Pelajaran Aktif</h3>
                 <div className="flex bg-slate-100 p-1 rounded-2xl">
                    {['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU'].map(day => (
                      <button key={day} onClick={() => setScheduleDay(day)} className={`px-4 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all ${scheduleDay === day ? 'bg-white text-indigo-600 shadow-xl' : 'text-slate-400'}`}>{day.slice(0,3)}</button>
                    ))}
                 </div>
              </div>
              <div className="overflow-x-auto">
                 <table className="w-full text-left">
                    <thead><tr className="border-b border-slate-50"><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Jam</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Waktu</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Kegiatan</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Mapping Kelas</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                       {schedule.filter(s => s.hari === scheduleDay).map((s, idx) => (
                         <tr key={idx} className="hover:bg-slate-50/50">
                            <td className="px-4 py-5 text-xs font-black italic">{s.jam}</td>
                            <td className="px-4 py-5 text-[10px] font-bold text-slate-400">{s.waktu}</td>
                            <td className="px-4 py-5 text-xs font-black uppercase italic tracking-tight">{s.kegiatan}</td>
                            <td className="px-4 py-5">
                               <div className="flex flex-wrap gap-2">
                                  {Object.entries(s.mapping).slice(0, 4).map(([cls, map]) => (
                                    <div key={cls} className="px-3 py-1 bg-slate-50 border border-slate-100 rounded-lg flex flex-col items-center">
                                       <span className="text-[8px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">{cls}</span>
                                       <span className="text-[10px] font-black uppercase leading-none">{(map as string).split('-')[0]}</span>
                                    </div>
                                  ))}
                               </div>
                            </td>
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {activeTab === 'settings' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-6">
           <div className={`p-8 rounded-[40px] border flex flex-col md:flex-row items-center md:items-start gap-8 shadow-2xl bg-emerald-50 border-emerald-100`}>
              <div className={`p-6 rounded-[32px] shadow-xl flex items-center justify-center bg-white text-emerald-600`}>
                 <Wifi size={40}/>
              </div>
              <div className="flex-1 text-center md:text-left">
                 <div className="flex flex-col md:flex-row md:items-center gap-3 mb-4">
                    <h4 className={`font-black text-sm uppercase italic tracking-widest text-emerald-800`}>Konektivitas Cloud: TERHUBUNG</h4>
                 </div>
                 <p className={`text-xs font-bold uppercase tracking-tight mb-4 leading-relaxed text-emerald-600/70`}>
                   Database utama SMPN 3 Pacet aktif di Google Spreadsheet API v4. Semua perubahan disinkronkan ke dokumen pusat sekolah.
                 </p>
              </div>
           </div>

           <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-2xl space-y-12">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                 <div>
                    <label className="text-[10px] font-black text-slate-400 mb-3 block uppercase tracking-[0.2em] italic">Tahun Pelajaran</label>
                    <input className="w-full bg-slate-50 border border-slate-100 px-8 py-5 rounded-3xl text-sm font-black outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50" value={settings.tahunPelajaran} onChange={e => setSettings(prev => ({...prev, tahunPelajaran: e.target.value}))}/>
                 </div>
                 <div>
                    <label className="text-[10px] font-black text-slate-400 mb-3 block uppercase tracking-[0.2em] italic">Semester</label>
                    <select className="w-full bg-slate-50 border border-slate-100 px-8 py-5 rounded-3xl text-sm font-black outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 uppercase" value={settings.semester} onChange={e => setSettings(prev => ({...prev, semester: e.target.value as any}))}>
                      <option value="Ganjil">SEMESTER GANJIL</option>
                      <option value="Genap">SEMESTER GENAP</option>
                    </select>
                 </div>
              </div>
              <div className="pt-12 border-t border-slate-50 flex flex-col md:flex-row items-center gap-10">
                <div className="p-8 bg-indigo-50 text-indigo-600 rounded-[40px] shrink-0 shadow-lg">
                   <RefreshCw size={40} className={isRestoring ? 'animate-spin' : ''}/>
                </div>
                <div className="flex-1 text-center md:text-left">
                   <h4 className="font-black text-xs uppercase italic mb-3 tracking-widest">Master Cloud Sync</h4>
                   <p className="text-[10px] text-slate-400 mb-8 font-black uppercase leading-relaxed italic tracking-wider">
                      Opsi untuk memulihkan atau memindahkan data dasar aplikasi ke Spreadsheet sekolah.
                   </p>
                   <button onClick={handleRestoreDefaults} disabled={isRestoring} className="bg-slate-900 text-white text-[11px] font-black uppercase px-12 py-5 rounded-3xl hover:bg-slate-800 transition-all shadow-2xl active:scale-95">
                      Sinkronkan Master Data Ke Cloud
                   </button>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;