import React, { useState, useMemo, useEffect } from 'react';
import { AttendanceRecord, AttendanceStatus, Teacher, AppSettings, SchoolEvent, ScheduleEntry, User, UserRole } from './types';
import { CLASSES, CLASS_COLORS, TEACHERS as INITIAL_TEACHERS, SCHEDULE as INITIAL_SCHEDULE, MAPEL_NAME_MAP, TEACHER_COLORS } from '../constants';
import { 
  Users, LayoutGrid, Calendar, Activity, Settings, ShieldCheck, BookOpen, Save, CheckCircle2, RefreshCw, 
  Wifi, BarChart3, AlertTriangle, Clock, Search, BookText, Plus, Trash2, CalendarDays, TrendingUp, UserCheck,
  Edit3, Coffee, Filter, PieChart as PieIcon, ChevronDown, Download, FileSpreadsheet, FileText, ChevronRight, X
} from 'lucide-react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend } from 'recharts';
import { spreadsheetService } from './spreadsheetService';

// Library ekspor
import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import 'jspdf-autotable';

interface AdminDashboardProps {
  user: User;
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

interface GroupedPermit {
  date: string;
  teacherId: string;
  teacherName: string;
  classId: string;
  status: AttendanceStatus;
  note: string;
  jams: string[];
  ids: string[];
}

const AdminDashboard: React.FC<AdminDashboardProps> = ({ 
  user, data, teachers, setTeachers, schedule, setSchedule, settings, setSettings, onSaveAttendance 
}) => {
  const [activeTab, setActiveTab] = useState<AdminTab>('overview');
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('harian');
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [searchTeacher, setSearchTeacher] = useState('');
  const [scheduleDay, setScheduleDay] = useState('SENIN');

  const [permitTeacherFilter, setPermitTeacherFilter] = useState('');
  const [permitMonthFilter, setPermitMonthFilter] = useState(new Date().getMonth() + 1 < 10 ? `0${new Date().getMonth() + 1}` : `${new Date().getMonth() + 1}`);

  const isAdmin = user.role === UserRole.ADMIN;
  const isKepalaSekolah = user.role === UserRole.KEPALA_SEKOLAH;
  const todayStr = new Date().toISOString().split('T')[0];

  const [selectedClassId, setSelectedClassId] = useState(CLASSES[0].id);
  const [selectedTeacherId, setSelectedTeacherId] = useState('');

  const formatSimpleDate = (dateStr: any) => {
    if (!dateStr) return '';
    const str = String(dateStr);
    if (str.includes('T')) {
      const dateObj = new Date(str);
      if (str.includes('17:00:00')) {
        dateObj.setHours(dateObj.getHours() + 7);
      }
      return dateObj.toISOString().split('T')[0];
    }
    return str;
  };

  const formatJamRange = (jams: string[]) => {
    const sorted = jams.map(Number).sort((a, b) => a - b);
    if (sorted.length === 0) return '';
    
    const ranges = [];
    let start = sorted[0];
    let prev = sorted[0];
    
    for (let i = 1; i <= sorted.length; i++) {
      if (i < sorted.length && sorted[i] === prev + 1) {
        prev = sorted[i];
      } else {
        if (start === prev) {
          ranges.push(`${start}`);
        } else {
          ranges.push(`${start}-${prev}`);
        }
        if (i < sorted.length) {
          start = sorted[i];
          prev = sorted[i];
        }
      }
    }
    return ranges.join(', ');
  };

  useEffect(() => {
    if (teachers.length > 0 && !selectedTeacherId) {
      setSelectedTeacherId(teachers[0].id);
    }
  }, [teachers, selectedTeacherId]);

  const [isTeacherModalOpen, setIsTeacherModalOpen] = useState(false);
  const [editingTeacherId, setEditingTeacherId] = useState<string | null>(null);
  const [teacherForm, setTeacherForm] = useState<Partial<Teacher>>({ id: '', nama: '', mapel: [] });

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [permitForm, setPermitForm] = useState({
    date: todayStr, teacherId: '', status: AttendanceStatus.IZIN, note: 'Izin keperluan keluarga', type: 'FULL_DAY', affected_jams: [] as string[]
  });

  const [newEvent, setNewEvent] = useState<Partial<SchoolEvent>>({ 
    tanggal: todayStr, nama: '', tipe: 'LIBUR', affected_jams: []
  });

  const getMapelArray = (mapel: any): string[] => {
    if (Array.isArray(mapel)) return mapel;
    if (typeof mapel === 'string' && mapel.trim() !== '') {
      return mapel.split(',').map(s => s.trim());
    }
    return [];
  };

  const getPeriodsForDate = (dateStr: string) => {
    if (!dateStr) return [];
    const d = new Date(dateStr);
    const dayNames = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU'];
    const targetDay = dayNames[d.getDay()];
    const daySlots = schedule.filter(s => s.hari === targetDay);
    return Array.from(new Set(daySlots.map(s => String(s.jam)))).sort();
  };

  const dateRange = useMemo(() => {
    const now = new Date();
    const end = todayStr;
    let start = todayStr;

    if (timeFilter === 'mingguan') {
      const prevWeek = new Date();
      prevWeek.setDate(now.getDate() - 7);
      start = prevWeek.toISOString().split('T')[0];
    } else if (timeFilter === 'bulanan') {
      const year = now.getFullYear();
      start = `${year}-${selectedMonth}-01`;
      const lastDay = new Date(year, parseInt(selectedMonth), 0).getDate();
      return { start, end: `${year}-${selectedMonth}-${lastDay}` };
    } else if (timeFilter === 'semester') {
      const year = now.getFullYear();
      if (settings.semester === 'Ganjil') {
        start = `${year}-07-01`;
        return { start, end: `${year}-12-31` };
      } else {
        start = `${year}-01-01`;
        return { start, end: `${year}-06-30` };
      }
    }
    
    return { start, end };
  }, [timeFilter, selectedMonth, settings.semester, todayStr]);

  const filteredRecords = useMemo(() => {
    return (data || []).filter(r => {
      const cleanDate = formatSimpleDate(r.tanggal);
      return cleanDate >= dateRange.start && cleanDate <= dateRange.end;
    });
  }, [data, dateRange]);

  const permitHistoryGrouped = useMemo(() => {
    const nowYear = new Date().getFullYear();
    let base = (data || []).filter(r => r.status === AttendanceStatus.IZIN || r.status === AttendanceStatus.SAKIT);

    base = base.filter(r => {
      const cleanDate = formatSimpleDate(r.tanggal);
      const parts = cleanDate.split('-');
      if (parts.length < 2) return false;
      const matchMonth = parts[1] === permitMonthFilter;
      const matchYear = parts[0] === nowYear.toString();
      const matchTeacher = permitTeacherFilter ? r.id_guru === permitTeacherFilter : true;
      return matchMonth && matchYear && matchTeacher;
    });

    const groups: Record<string, GroupedPermit> = {};

    base.forEach(r => {
      const cleanDate = formatSimpleDate(r.tanggal);
      const key = `${cleanDate}_${r.id_guru}_${r.id_kelas}_${r.status}_${r.catatan || ''}`;
      
      if (!groups[key]) {
        groups[key] = {
          date: cleanDate,
          teacherId: r.id_guru,
          teacherName: r.nama_guru,
          classId: r.id_kelas,
          status: r.status,
          note: r.catatan || '',
          jams: [String(r.jam)],
          ids: [r.id]
        };
      } else {
        if (!groups[key].jams.includes(String(r.jam))) {
          groups[key].jams.push(String(r.jam));
        }
        groups[key].ids.push(r.id);
      }
    });

    return Object.values(groups).sort((a, b) => b.date.localeCompare(a.date));
  }, [data, permitTeacherFilter, permitMonthFilter]);

  const classAnalysis = useMemo(() => {
    const classRecords = filteredRecords.filter(r => r.id_kelas === selectedClassId);
    const performance: Record<string, any> = {};
    classRecords.forEach(r => {
      if (!performance[r.nama_guru]) performance[r.nama_guru] = { name: r.nama_guru, Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0 };
      const key = r.status === AttendanceStatus.TIDAK_HADIR ? 'Alpha' : r.status;
      if (performance[r.nama_guru][key] !== undefined) performance[r.nama_guru][key]++;
    });
    return {
      chart: Object.values(performance),
      stats: {
        hadir: classRecords.filter(r => r.status === AttendanceStatus.HADIR).length,
        izin: classRecords.filter(r => r.status === AttendanceStatus.IZIN).length,
        sakit: classRecords.filter(r => r.status === AttendanceStatus.SAKIT).length,
        alpha: classRecords.filter(r => r.status === AttendanceStatus.TIDAK_HADIR).length,
      }
    };
  }, [filteredRecords, selectedClassId]);

  const teacherAnalysis = useMemo(() => {
    const teacherRecords = filteredRecords.filter(r => r.id_guru === selectedTeacherId);
    const distribution: Record<string, any> = {};
    teacherRecords.forEach(r => {
      if (!distribution[r.id_kelas]) distribution[r.id_kelas] = { name: r.id_kelas, Hadir: 0, Izin: 0, Sakit: 0, Alpha: 0 };
      const key = r.status === AttendanceStatus.TIDAK_HADIR ? 'Alpha' : r.status;
      distribution[r.id_kelas][key]++;
    });
    return {
      chart: Object.values(distribution),
      stats: {
        hadir: teacherRecords.filter(r => r.status === AttendanceStatus.HADIR).length,
        izin: teacherRecords.filter(r => r.status === AttendanceStatus.IZIN).length,
        sakit: teacherRecords.filter(r => r.status === AttendanceStatus.SAKIT).length,
        alpha: teacherRecords.filter(r => r.status === AttendanceStatus.TIDAK_HADIR).length,
      }
    };
  }, [filteredRecords, selectedTeacherId]);

  const exportExcel = (data: any[], fileName: string) => {
    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Data");
    XLSX.writeFile(workbook, `${fileName}.xlsx`);
  };

  const exportPDF = (title: string, headers: string[][], rows: any[][], fileName: string) => {
    const doc = new jsPDF();
    doc.setFontSize(16);
    doc.text(title, 14, 20);
    doc.setFontSize(10);
    doc.text(`Dicetak pada: ${new Date().toLocaleString('id-ID')}`, 14, 28);
    (doc as any).autoTable({
      startY: 35,
      head: headers,
      body: rows,
      theme: 'grid',
      headStyles: { fillStyle: [79, 70, 229] }
    });
    doc.save(`${fileName}.pdf`);
  };

  const handleSaveSettings = async () => {
    setIsSavingSettings(true);
    try {
      const success = await spreadsheetService.saveRecord('settings', { id: 'settings', ...settings });
      if (success) alert('Pengaturan disimpan.');
    } finally { setIsSavingSettings(false); }
  };

  const handleApplyPermit = async () => {
    if (!permitForm.teacherId || !permitForm.date) return;
    const d = new Date(permitForm.date);
    const dayNames = ['MINGGU', 'SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU'];
    const selectedDay = dayNames[d.getDay()];
    let teacherSchedule = schedule.filter(s => s.hari === selectedDay && s.kegiatan === 'KBM');
    
    if (permitForm.type === 'SPECIFIC_HOURS') {
      if (permitForm.affected_jams.length === 0) { alert('Pilih jam!'); return; }
      teacherSchedule = teacherSchedule.filter(s => permitForm.affected_jams.includes(String(s.jam)));
    }
    
    const records: AttendanceRecord[] = [];
    const teacher = teachers.find(t => t.id === permitForm.teacherId);
    teacherSchedule.forEach(slot => {
      CLASSES.forEach(cls => {
        const mapping = slot.mapping[cls.id] as string;
        if (mapping && mapping.split('-')[1] === permitForm.teacherId) {
          records.push({
            id: `${permitForm.date}-${cls.id}-${slot.jam}`,
            id_guru: permitForm.teacherId,
            nama_guru: teacher?.nama || permitForm.teacherId,
            mapel: mapping.split('-')[0],
            id_kelas: cls.id,
            tanggal: permitForm.date,
            jam: String(slot.jam),
            status: permitForm.status,
            catatan: permitForm.note,
            is_admin_input: true
          });
        }
      });
    });
    
    if (records.length === 0) { alert('Guru tidak mengajar di hari tersebut.'); return; }
    await onSaveAttendance(records);
    alert('Laporan izin berhasil diproses.');
    setPermitForm({ ...permitForm, affected_jams: [] });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteGroupedPermit = async (item: GroupedPermit) => {
    if (!confirm(`Hapus catatan izin ${item.teacherName} pada ${item.date} untuk kelas ${item.classId} jam ${formatJamRange(item.jams)}?`)) return;
    
    let allSuccess = true;
    for (const id of item.ids) {
      const success = await spreadsheetService.deleteRecord('attendance', id);
      if (!success) allSuccess = false;
    }
    
    if (allSuccess) {
      alert('Data berhasil dihapus.');
      window.location.reload(); 
    } else {
      alert('Terjadi kesalahan saat menghapus beberapa record.');
    }
  };

  const handleRestoreDefaults = async () => {
    if (!confirm('Timpah data Cloud dengan master data awal?')) return;
    setIsRestoring(true);
    try {
      for (const t of INITIAL_TEACHERS) await spreadsheetService.saveRecord('teachers', t);
      for (const s of INITIAL_SCHEDULE) await spreadsheetService.saveRecord('schedule', s);
      await spreadsheetService.saveRecord('settings', { id: 'settings', ...settings });
      alert('Restorasi selesai.');
    } finally { setIsRestoring(false); }
  };

  const handleAddEvent = async () => {
    if (!newEvent.nama || !newEvent.tanggal) return;
    if (newEvent.tipe === 'JAM_KHUSUS' && (!newEvent.affected_jams || newEvent.affected_jams.length === 0)) {
      alert('Pilih jam yang terkena penyesuaian!');
      return;
    }
    const event = { ...newEvent, id: editingEventId || Date.now().toString() } as SchoolEvent;
    const updatedEvents = editingEventId 
      ? (settings.events || []).map(e => e.id === editingEventId ? event : e)
      : [...(settings.events || []), event];
    const success = await spreadsheetService.saveRecord('settings', { ...settings, events: updatedEvents });
    if (success) {
      setSettings(prev => ({ ...prev, events: updatedEvents }));
      setNewEvent({ tanggal: todayStr, nama: '', tipe: 'LIBUR', affected_jams: [] });
      setEditingEventId(null);
      alert(editingEventId ? 'Agenda berhasil diperbarui.' : 'Agenda berhasil ditambahkan.');
    }
  };

  const handleEditEvent = (ev: SchoolEvent) => {
    setNewEvent(ev);
    setEditingEventId(ev.id);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleDeleteEvent = async (eventId: string) => {
    if (!confirm('Hapus agenda ini?')) return;
    const updatedEvents = (settings.events || []).filter(e => e.id !== eventId);
    const success = await spreadsheetService.saveRecord('settings', { ...settings, events: updatedEvents });
    if (success) {
      setSettings(prev => ({ ...prev, events: updatedEvents }));
    }
  };

  const handleSaveTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teacherForm.id || !teacherForm.nama) return;
    const newTeacher = { id: teacherForm.id, nama: teacherForm.nama, mapel: teacherForm.mapel || [] } as Teacher;
    const success = await spreadsheetService.saveRecord('teachers', newTeacher);
    if (success) {
      setTeachers(prev => {
        if (editingTeacherId) return prev.map(t => t.id === editingTeacherId ? newTeacher : t);
        return [...prev, newTeacher];
      });
      setIsTeacherModalOpen(false);
      setTeacherForm({ id: '', nama: '', mapel: [] });
      alert('Data guru berhasil disimpan.');
    }
  };

  const handleDeleteTeacher = async (teacherId: string) => {
    if (!confirm('Hapus data guru ini?')) return;
    const success = await spreadsheetService.deleteRecord('teachers', teacherId);
    if (success) {
      setTeachers(prev => prev.filter(t => t.id !== teacherId));
      alert('Data guru berhasil dihapus.');
    }
  };

  const availableTabs = [
    { id: 'overview', icon: <LayoutGrid size={16}/>, label: 'Ikhtisar' },
    { id: 'monitoring', icon: <Activity size={16}/>, label: 'Live' },
    { id: 'permits', icon: <ShieldCheck size={16}/>, label: 'Izin' },
    { id: 'agenda', icon: <CalendarDays size={16}/>, label: 'Agenda' },
    ...(isAdmin ? [
      { id: 'teachers', icon: <Users size={16}/>, label: 'Guru' },
      { id: 'schedule', icon: <BookOpen size={16}/>, label: 'Jadwal' },
      { id: 'settings', icon: <Settings size={16}/>, label: 'Sistem' }
    ] : [])
  ];

  return (
    <div className="space-y-6 pb-20 animate-in fade-in duration-500">
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-black text-slate-800 tracking-tight uppercase italic">{isAdmin ? 'Control' : isKepalaSekolah ? 'Head' : 'Monitor'} <span className="text-indigo-600">Center</span></h1>
          <p className="text-slate-500 text-[9px] font-black uppercase tracking-[0.2em] italic">Database Integrasi • SMPN 3 Pacet</p>
        </div>
        <div className="bg-white p-1 rounded-2xl border border-slate-200 shadow-sm flex overflow-x-auto no-scrollbar gap-1">
          {availableTabs.map(tab => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id as any)} className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-[9px] font-black uppercase transition-all shrink-0 ${activeTab === tab.id ? 'bg-indigo-600 text-white shadow-lg' : 'text-slate-500 hover:bg-slate-50'}`}>
              {tab.icon} {tab.label}
            </button>
          ))}
        </div>
      </header>

      {/* OVERVIEW TAB */}
      {activeTab === 'overview' && (
        <div className="space-y-8 animate-in slide-in-from-bottom-4">
          <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-white p-6 rounded-[32px] border border-slate-100 shadow-sm">
             <div className="flex bg-slate-100 p-1 rounded-2xl shrink-0">
                {(['harian', 'mingguan', 'bulanan', 'semester'] as TimeFilter[]).map(f => (
                  <button key={f} onClick={() => setTimeFilter(f)} className={`px-6 py-2.5 text-[9px] font-black uppercase rounded-xl transition-all ${timeFilter === f ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-500'}`}>{f}</button>
                ))}
             </div>
             <div className="flex items-center gap-4">
                {timeFilter === 'bulanan' && (
                  <select value={selectedMonth} onChange={e => setSelectedMonth(e.target.value)} className="bg-slate-50 border border-slate-100 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase outline-none italic">
                     {['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => <option key={m} value={m}>{new Date(2024, parseInt(m)-1).toLocaleString('id-ID', {month: 'long'})}</option>)}
                  </select>
                )}
                <div className="px-5 py-2.5 bg-indigo-50 border border-indigo-100 rounded-xl text-center">
                   <p className="text-[8px] font-black text-indigo-400 uppercase italic leading-none mb-1">Periode Aktif</p>
                   <p className="text-[10px] font-black text-indigo-600 uppercase italic">{dateRange.start} s/d {dateRange.end}</p>
                </div>
             </div>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {[
              { label: 'Hadir', val: filteredRecords.filter(r => r.status === AttendanceStatus.HADIR).length, color: 'emerald', icon: <CheckCircle2 size={18}/> },
              { label: 'Izin', val: filteredRecords.filter(r => r.status === AttendanceStatus.IZIN).length, color: 'indigo', icon: <ShieldCheck size={18}/> },
              { label: 'Sakit', val: filteredRecords.filter(r => r.status === AttendanceStatus.SAKIT).length, color: 'amber', icon: <Activity size={18}/> },
              { label: 'Alpha', val: filteredRecords.filter(r => r.status === AttendanceStatus.TIDAK_HADIR).length, color: 'rose', icon: <AlertTriangle size={18}/> }
            ].map((s, i) => (
              <div key={i} className="bg-white p-5 rounded-[28px] border border-slate-100 shadow-sm flex items-center gap-3">
                <div className={`p-3 rounded-2xl bg-${s.color}-50 text-${s.color}-600`}>{s.icon}</div>
                <div><p className="text-[8px] font-black text-slate-400 uppercase italic leading-none mb-1">{s.label}</p><h3 className="text-lg font-black text-slate-800">{s.val}</h3></div>
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-2xl">
              <div className="flex items-center justify-between mb-8">
                 <h3 className="text-xs font-black uppercase italic text-slate-800 flex items-center gap-2"><BarChart3 size={16} className="text-indigo-600"/> Analisis Per Kelas</h3>
                 <div className="flex items-center gap-2">
                    <button onClick={() => exportExcel(classAnalysis.chart, `Analisis_Kelas_${selectedClassId}`)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Excel"><FileSpreadsheet size={18}/></button>
                    <button onClick={() => exportPDF(`Analisis Performa Kelas ${selectedClassId}`, [["Guru", "Hadir", "Izin", "Sakit", "Alpha"]], classAnalysis.chart.map(c => [c.name, c.Hadir, c.Izin, c.Sakit, c.Alpha]), `Analisis_Kelas_${selectedClassId}`)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="PDF"><FileText size={18}/></button>
                    <select className="bg-slate-50 border border-slate-100 pl-6 pr-10 py-3 rounded-2xl text-[10px] font-black uppercase outline-none min-w-[140px]" value={selectedClassId} onChange={e => setSelectedClassId(e.target.value)}>
                      {CLASSES.map(c => <option key={c.id} value={c.id}>KELAS {c.id}</option>)}
                    </select>
                 </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={classAnalysis.chart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" angle={-45} textAnchor="end" height={60} tick={{fill: '#94a3b8', fontSize: 8, fontWeight: 'black'}} axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 'black'}} />
                    <Tooltip cursor={{fill: '#f8fafc'}} />
                    <Bar dataKey="Hadir" fill="#10b981" radius={[4, 4, 0, 0]} barSize={8} />
                    <Bar dataKey="Izin" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={8} />
                    <Bar dataKey="Sakit" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={8} />
                    <Bar dataKey="Alpha" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={8} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
            <div className="bg-white p-8 rounded-[40px] border border-slate-100 shadow-2xl">
               <div className="flex items-center justify-between mb-8">
                 <h3 className="text-xs font-black uppercase italic text-slate-800 flex items-center gap-2"><UserCheck size={16} className="text-indigo-600"/> Analisis Per Guru</h3>
                 <div className="flex items-center gap-2">
                    <button onClick={() => exportExcel(teacherAnalysis.chart, `Analisis_Guru_${selectedTeacherId}`)} className="p-2 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-all" title="Excel"><FileSpreadsheet size={18}/></button>
                    <button onClick={() => exportPDF(`Analisis Performa Guru: ${teachers.find(t=>t.id===selectedTeacherId)?.nama}`, [["Kelas", "Hadir", "Izin", "Sakit", "Alpha"]], teacherAnalysis.chart.map(c => [c.name, c.Hadir, c.Izin, c.Sakit, c.Alpha]), `Analisis_Guru_${selectedTeacherId}`)} className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg transition-all" title="PDF"><FileText size={18}/></button>
                    <select className="bg-slate-50 border border-slate-100 pl-6 pr-10 py-3 rounded-2xl text-[10px] font-black uppercase outline-none min-w-[180px]" value={selectedTeacherId} onChange={e => setSelectedTeacherId(e.target.value)}>
                      {teachers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}
                    </select>
                 </div>
              </div>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={teacherAnalysis.chart}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                    <XAxis dataKey="name" tick={{fill: '#94a3b8', fontSize: 10, fontWeight: 'black'}} axisLine={false} tickLine={false} />
                    <YAxis axisLine={false} tickLine={false} tick={{fill: '#94a3b8', fontSize: 9, fontWeight: 'black'}} />
                    <Tooltip cursor={{fill: '#f8fafc'}} />
                    <Bar dataKey="Hadir" fill="#10b981" radius={[4, 4, 0, 0]} barSize={10} />
                    <Bar dataKey="Izin" fill="#3b82f6" radius={[4, 4, 0, 0]} barSize={10} />
                    <Bar dataKey="Sakit" fill="#f59e0b" radius={[4, 4, 0, 0]} barSize={10} />
                    <Bar dataKey="Alpha" fill="#ef4444" radius={[4, 4, 0, 0]} barSize={10} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* PERMITS TAB */}
      {activeTab === 'permits' && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-6">
           <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl">
              <h3 className="text-sm font-black uppercase italic mb-8 flex items-center gap-4 text-slate-800"><ShieldCheck size={24} className="text-indigo-600"/> Input Izin Guru Pusat</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic tracking-widest">Tanggal</label><input type="date" className="w-full bg-slate-50 border border-slate-100 px-5 py-4 rounded-2xl font-black outline-none focus:bg-white text-[11px] uppercase italic" value={permitForm.date} onChange={e => setPermitForm({...permitForm, date: e.target.value, affected_jams: []})}/></div>
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic tracking-widest">Pilih Guru</label><select className="w-full bg-slate-50 border border-slate-100 px-5 py-4 rounded-2xl font-black outline-none focus:bg-white text-[11px] uppercase italic" value={permitForm.teacherId} onChange={e => setPermitForm({...permitForm, teacherId: e.target.value})}><option value="">-- PILIH GURU --</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}</select></div>
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic tracking-widest">Status</label><select className="w-full bg-slate-50 border border-slate-100 px-5 py-4 rounded-2xl font-black outline-none focus:bg-white text-[11px] uppercase italic" value={permitForm.status} onChange={e => setPermitForm({...permitForm, status: e.target.value as any})}><option value={AttendanceStatus.IZIN}>IZIN</option><option value={AttendanceStatus.SAKIT}>SAKIT</option></select></div>
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic tracking-widest">Metode Berlaku</label><select className="w-full bg-slate-50 border border-slate-100 px-5 py-4 rounded-2xl font-black outline-none focus:bg-white text-[11px] uppercase italic" value={permitForm.type} onChange={e => setPermitForm({...permitForm, type: e.target.value as any, affected_jams: []})}><option value="FULL_DAY">SEHARIAN PENUH</option><option value="SPECIFIC_HOURS">JAM TERTENTU</option></select></div>
                 <div className="md:col-span-2">
                    <label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic tracking-widest">Keterangan / Alasan Izin</label>
                    <textarea 
                      className="w-full bg-slate-50 border border-slate-100 px-5 py-4 rounded-2xl font-black outline-none focus:bg-white text-[11px] uppercase italic min-h-[80px]" 
                      placeholder="CONTOH: IZIN KEPERLUAN KELUARGA / SAKIT DISERTAI SURAT DOKTER"
                      value={permitForm.note} 
                      onChange={e => setPermitForm({...permitForm, note: e.target.value})}
                    />
                 </div>
              </div>
              {permitForm.type === 'SPECIFIC_HOURS' && (
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8">
                   <p className="text-[10px] font-black text-slate-400 mb-4 uppercase flex items-center gap-2 italic leading-none"><Clock size={14}/> Pilih Jam Mengajar:</p>
                   <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                      {getPeriodsForDate(permitForm.date).map(jam => (
                        <label key={jam} className={`flex flex-col items-center p-3 rounded-2xl border cursor-pointer transition-all ${permitForm.affected_jams.includes(String(jam)) ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg' : 'bg-white text-slate-400 border-slate-200'}`}>
                           <input type="checkbox" className="hidden" checked={permitForm.affected_jams.includes(String(jam))} onChange={e => { const updated = e.target.checked ? [...permitForm.affected_jams, String(jam)] : permitForm.affected_jams.filter(j => j !== String(jam)); setPermitForm({...permitForm, affected_jams: updated}); }}/>
                           <span className="text-xs font-black">{jam}</span>
                        </label>
                      ))}
                   </div>
                </div>
              )}
              <button onClick={handleApplyPermit} className="w-full bg-indigo-600 text-white font-black py-5 rounded-[22px] shadow-xl hover:bg-indigo-700 transition-all text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95"><Save size={18}/> Kirim Laporan Izin</button>
           </div>

           {/* RIWAYAT IZIN CONSOLIDATED */}
           <div className="bg-white rounded-[40px] border border-slate-100 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-slate-50/30">
                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
                   <h3 className="text-xs font-black uppercase italic text-slate-800">Manajemen Riwayat Izin</h3>
                   <div className="flex items-center gap-3">
                      <button onClick={() => exportExcel(permitHistoryGrouped, `Riwayat_Izin`)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2"><FileSpreadsheet size={14}/> Excel</button>
                      <button onClick={() => exportPDF(`Riwayat Izin Guru`, [["Tanggal", "Guru", "Kelas", "Jam", "Status", "Catatan"]], permitHistoryGrouped.map(p => [p.date, p.teacherName, p.classId, formatJamRange(p.jams), p.status, p.note]), `Riwayat_Izin`)} className="bg-rose-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2"><FileText size={14}/> PDF</button>
                   </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-4 bg-white p-4 rounded-3xl border border-slate-100">
                   <div className="flex items-center gap-2 shrink-0">
                      <Filter size={14} className="text-slate-400"/>
                      <span className="text-[9px] font-black uppercase text-slate-400 italic">Filter:</span>
                   </div>
                   <select className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase outline-none min-w-[160px]" value={permitTeacherFilter} onChange={e => setPermitTeacherFilter(e.target.value)}><option value="">SEMUA GURU</option>{teachers.map(t => <option key={t.id} value={t.id}>{t.nama}</option>)}</select>
                   <select className="bg-slate-50 border border-slate-100 px-4 py-2 rounded-xl text-[10px] font-black uppercase outline-none" value={permitMonthFilter} onChange={e => setPermitMonthFilter(e.target.value)}>{['01','02','03','04','05','06','07','08','09','10','11','12'].map(m => (<option key={m} value={m}>{new Date(2024, parseInt(m)-1).toLocaleString('id-ID', {month: 'long'}).toUpperCase()}</option>))}</select>
                   {(permitTeacherFilter || permitMonthFilter !== (new Date().getMonth() + 1).toString().padStart(2, '0')) && (<button onClick={() => { setPermitTeacherFilter(''); setPermitMonthFilter((new Date().getMonth() + 1).toString().padStart(2, '0')); }} className="text-[9px] font-black text-rose-500 uppercase italic">Reset Filter</button>)}
                </div>
              </div>

              <div className="overflow-x-auto no-scrollbar">
                 <table className="w-full text-left">
                    <thead><tr className="bg-slate-50/50"><th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase italic">Tanggal</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase italic">Guru</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase italic">Kelas</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase italic">Jam</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase italic text-center">Status</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase italic">Keterangan</th><th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase italic text-right">Aksi</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                       {permitHistoryGrouped.length === 0 ? (
                         <tr><td colSpan={7} className="py-20 text-center text-[10px] font-black uppercase text-slate-400 italic">Tidak ada riwayat izin ditemukan</td></tr>
                       ) : (
                         permitHistoryGrouped.map((p, i) => (
                           <tr key={i} className="hover:bg-slate-50/50 group">
                              <td className="px-8 py-5 text-[10px] font-black italic">{p.date}</td>
                              <td className="px-4 py-5 text-[10px] font-black uppercase italic text-slate-700">{p.teacherName}</td>
                              <td className="px-4 py-5 text-[10px] font-black uppercase italic text-slate-400">{p.classId}</td>
                              <td className="px-4 py-5 text-[10px] font-black uppercase italic text-indigo-600">{formatJamRange(p.jams)}</td>
                              <td className="px-4 py-5 text-center"><span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${p.status === AttendanceStatus.SAKIT ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>{p.status}</span></td>
                              <td className="px-4 py-5 text-[9px] font-bold text-slate-400 uppercase italic truncate max-w-[150px]">{p.note || '-'}</td>
                              <td className="px-8 py-5 text-right">
                                 <div className="flex items-center justify-end gap-2 opacity-0 group-hover:opacity-100 transition-all">
                                    <button onClick={() => { 
                                       setPermitForm({ date: p.date, teacherId: p.teacherId, status: p.status, note: p.note, type: 'SPECIFIC_HOURS', affected_jams: p.jams });
                                       window.scrollTo({ top: 0, behavior: 'smooth' });
                                    }} className="p-2 bg-indigo-50 text-indigo-600 rounded-lg hover:bg-indigo-600 hover:text-white transition-all"><Edit3 size={14}/></button>
                                    <button onClick={() => handleDeleteGroupedPermit(p)} className="p-2 bg-rose-50 text-rose-600 rounded-lg hover:bg-rose-600 hover:text-white transition-all"><Trash2 size={14}/></button>
                                 </div>
                              </td>
                           </tr>
                         ))
                       )}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {/* AGENDA TAB */}
      {activeTab === 'agenda' && (isAdmin || isKepalaSekolah) && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-6">
           <div className={`bg-white p-10 rounded-[40px] border shadow-2xl transition-all ${editingEventId ? 'border-indigo-300 ring-4 ring-indigo-50' : 'border-slate-100'}`}>
              <h3 className="text-sm font-black uppercase italic mb-8 flex items-center gap-4 text-slate-800">
                {editingEventId ? <Edit3 size={24} className="text-indigo-600"/> : <Calendar size={24} className="text-indigo-600"/>}
                {editingEventId ? 'Perbarui Agenda Sekolah' : 'Tambah Agenda / Libur Sekolah'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic tracking-widest">Tanggal</label><input type="date" className="w-full bg-slate-50 border border-slate-100 px-5 py-4 rounded-2xl font-black outline-none focus:bg-white uppercase text-[11px]" value={newEvent.tanggal} onChange={e => { setNewEvent({...newEvent, tanggal: e.target.value, affected_jams: []}); }}/></div>
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic tracking-widest">Tipe Agenda</label><select className="w-full bg-slate-50 border border-slate-100 px-5 py-4 rounded-2xl font-black outline-none focus:bg-white text-[11px] uppercase" value={newEvent.tipe} onChange={e => setNewEvent({...newEvent, tipe: e.target.value as any, affected_jams: []})}><option value="LIBUR">LIBUR SEKOLAH</option><option value="KEGIATAN">KEGIATAN SEKOLAH</option><option value="JAM_KHUSUS">PENYESUAIAN JAM</option></select></div>
                 <div><label className="text-[10px] font-black text-slate-400 mb-2 block uppercase italic tracking-widest">Nama Agenda</label><input type="text" className="w-full bg-slate-50 border border-slate-100 px-5 py-4 rounded-2xl font-black outline-none focus:bg-white uppercase italic text-[11px]" placeholder="CONTOH: LIBUR SEMESTER" value={newEvent.nama} onChange={e => setNewEvent({...newEvent, nama: e.target.value})}/></div>
              </div>

              {newEvent.tipe === 'JAM_KHUSUS' && (
                <div className="bg-slate-50 p-6 rounded-3xl border border-slate-100 mb-8">
                   <p className="text-[10px] font-black text-slate-400 mb-4 uppercase flex items-center gap-2 italic leading-none tracking-widest"><Clock size={14}/> Pilih Jam Pelajaran yang Terkena Penyesuaian:</p>
                   <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                      {getPeriodsForDate(newEvent.tanggal || '').map(jam => (
                        <label key={jam} className={`flex flex-col items-center p-3 rounded-2xl border cursor-pointer transition-all ${newEvent.affected_jams?.includes(String(jam)) ? 'bg-indigo-600 text-white border-indigo-700 shadow-lg' : 'bg-white text-slate-400 border-slate-200'}`}>
                           <input type="checkbox" className="hidden" checked={newEvent.affected_jams?.includes(String(jam))} onChange={e => { const currentJams = newEvent.affected_jams || []; const updated = e.target.checked ? [...currentJams, String(jam)] : currentJams.filter(j => j !== String(jam)); setNewEvent({...newEvent, affected_jams: updated}); }}/>
                           <span className="text-xs font-black">{jam}</span>
                        </label>
                      ))}
                   </div>
                </div>
              )}

              <div className="flex gap-4">
                 <button onClick={handleAddEvent} className={`flex-1 font-black py-5 rounded-[22px] shadow-xl transition-all text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95 ${editingEventId ? 'bg-amber-500 text-white hover:bg-amber-600' : 'bg-indigo-600 text-white hover:bg-indigo-700'}`}>
                    {editingEventId ? <RefreshCw size={18}/> : <Plus size={18}/>}
                    {editingEventId ? 'Perbarui Perubahan' : 'Terbitkan Agenda'}
                 </button>
                 {editingEventId && (<button onClick={() => { setEditingEventId(null); setNewEvent({ tanggal: todayStr, nama: '', tipe: 'LIBUR', affected_jams: [] }); }} className="bg-slate-100 text-slate-500 px-8 py-5 rounded-[22px] font-black text-[11px] uppercase tracking-widest">Batal</button>)}
              </div>
           </div>
           
           <div className="bg-white rounded-[40px] border border-slate-100 shadow-2xl overflow-hidden">
              <div className="p-8 border-b border-slate-50 bg-slate-50/30 flex items-center justify-between">
                <h3 className="text-[9px] font-black uppercase italic tracking-[0.2em] text-slate-400">Daftar Agenda Terdaftar</h3>
                <div className="flex items-center gap-3">
                   <button onClick={() => exportExcel(settings.events || [], `Agenda_Sekolah`)} className="bg-emerald-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2"><FileSpreadsheet size={14}/> Excel</button>
                   <button onClick={() => exportPDF(`Daftar Agenda Sekolah`, [["Tanggal", "Kegiatan", "Tipe", "Jam"]], (settings.events || []).map(e => [formatSimpleDate(e.tanggal), e.nama, e.tipe, e.affected_jams?.join(', ') || 'Semua']), `Agenda_Sekolah`)} className="bg-rose-600 text-white px-4 py-2 rounded-xl text-[9px] font-black uppercase flex items-center gap-2"><FileText size={14}/> PDF</button>
                </div>
              </div>
              <table className="w-full text-left">
                 <thead><tr className="bg-slate-50/50"><th className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Tanggal</th><th className="px-4 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Kegiatan</th><th className="px-4 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest italic text-center">Tipe</th><th className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest italic text-right">Aksi</th></tr></thead>
                 <tbody className="divide-y divide-slate-50">
                    {(settings.events || []).length === 0 ? (
                      <tr><td colSpan={4} className="py-20 text-center text-[10px] font-black uppercase text-slate-400 italic">Belum ada agenda sekolah terdaftar</td></tr>
                    ) : (
                      settings.events.map((ev, i) => (
                        <tr key={ev.id || i} className="hover:bg-slate-50/50 group">
                          <td className="px-8 py-6 text-xs font-black italic">{formatSimpleDate(ev.tanggal)}</td>
                          <td className="px-4 py-6">
                            <div className="text-xs font-black uppercase italic text-slate-700">{ev.nama}</div>
                            {ev.tipe === 'JAM_KHUSUS' && ev.affected_jams && ev.affected_jams.length > 0 && (<div className="text-[8px] text-indigo-500 font-bold mt-1">Jam Terkena: {ev.affected_jams.join(', ')}</div>)}
                          </td>
                          <td className="px-4 py-6 text-center"><span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase tracking-widest ${ev.tipe === 'LIBUR' ? 'bg-rose-50 text-rose-600' : ev.tipe === 'JAM_KHUSUS' ? 'bg-amber-50 text-amber-600' : 'bg-indigo-50 text-indigo-600'}`}>{ev.tipe}</span></td>
                          <td className="px-8 py-6 text-right">
                             <div className="flex items-center justify-end gap-2">
                                <button onClick={() => handleEditEvent(ev)} className="p-2 text-slate-300 hover:text-indigo-600 transition-colors active:scale-90"><Edit3 size={18}/></button>
                                <button onClick={() => handleDeleteEvent(ev.id || '')} className="p-2 text-slate-300 hover:text-rose-500 transition-colors active:scale-90"><Trash2 size={18}/></button>
                             </div>
                          </td>
                        </tr>
                      ))
                    )}
                 </tbody>
              </table>
           </div>
        </div>
      )}

      {/* MONITORING TAB */}
      {activeTab === 'monitoring' && (
        <div className="bg-white rounded-[40px] border border-slate-100 shadow-2xl overflow-hidden animate-in slide-in-from-bottom-6">
          <div className="p-8 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
            <h3 className="text-xs font-black uppercase italic">Live Monitoring Absensi</h3>
            <div className="flex items-center gap-2"><span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span><span className="text-[9px] font-black text-emerald-600 uppercase italic">Sinkronisasi Cloud Aktif</span></div>
          </div>
          <div className="overflow-x-auto no-scrollbar">
            <table className="w-full text-left">
              <thead><tr className="bg-slate-50/50"><th className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Jam</th><th className="px-4 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Kelas</th><th className="px-4 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest">Guru</th><th className="px-8 py-6 text-[9px] font-black text-slate-400 uppercase tracking-widest text-center">Status</th></tr></thead>
              <tbody className="divide-y divide-slate-50">
                {(filteredRecords || []).filter(r => formatSimpleDate(r.tanggal) === todayStr).length === 0 ? (
                  <tr><td colSpan={4} className="py-20 text-center text-[10px] font-black uppercase text-slate-400 italic">Belum ada absensi terdaftar hari ini</td></tr>
                ) : (
                  (filteredRecords || []).filter(r => formatSimpleDate(r.tanggal) === todayStr).map((r, i) => (
                    <tr key={i} className="hover:bg-slate-50/50">
                      <td className="px-8 py-6 text-xs font-black text-slate-500 italic">Jam {r.jam}</td>
                      <td className="px-4 py-6"><span className={`px-3 py-1 rounded-lg text-[10px] font-black ${CLASS_COLORS[r.id_kelas]}`}>{r.id_kelas}</span></td>
                      <td className="px-4 py-6 text-xs font-black uppercase text-slate-800">{r.nama_guru}</td>
                      <td className="px-8 py-6 text-center"><span className={`px-4 py-1.5 rounded-full text-[9px] font-black uppercase tracking-widest ${r.status === AttendanceStatus.HADIR ? 'bg-emerald-50 text-emerald-600' : 'bg-rose-50 text-rose-600'}`}>{r.status}</span></td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TEACHERS TAB */}
      {activeTab === 'teachers' && isAdmin && (
        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-6">
           <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                 <div>
                    <h3 className="text-sm font-black uppercase italic flex items-center gap-3 text-slate-800"><Users size={24} className="text-indigo-600"/> Manajemen Guru</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase mt-1 italic tracking-widest leading-none">Database Terpusat</p>
                 </div>
                 <div className="flex flex-wrap items-center gap-4">
                    <div className="relative">
                       <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-300" size={18}/>
                       <input type="text" placeholder="CARI NAMA GURU..." className="pl-12 pr-6 py-4 bg-slate-50 border border-slate-100 rounded-2xl text-[10px] font-black uppercase outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 min-w-[280px]" value={searchTeacher} onChange={e => setSearchTeacher(e.target.value)}/>
                    </div>
                    <button onClick={() => { setIsTeacherModalOpen(true); setEditingTeacherId(null); setTeacherForm({ id: '', nama: '', mapel: [] }); }} className="bg-indigo-600 text-white font-black px-8 py-4 rounded-2xl shadow-xl shadow-indigo-100 hover:bg-indigo-700 transition-all text-[10px] uppercase tracking-widest flex items-center gap-3 active:scale-95"><Plus size={18}/> Tambah Guru</button>
                 </div>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                 <table className="w-full text-left">
                    <thead><tr className="border-b border-slate-50"><th className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Kode</th><th className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Nama Lengkap</th><th className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Mata Pelajaran</th><th className="px-6 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic text-right">Aksi</th></tr></thead>
                    <tbody className="divide-y divide-slate-50">
                       {teachers.filter(t => t.nama.toLowerCase().includes(searchTeacher.toLowerCase())).map(t => (
                         <tr key={t.id} className="hover:bg-slate-50/50 group transition-colors">
                            <td className="px-6 py-5"><span className="text-[10px] font-black px-3 py-1 bg-slate-100 rounded-lg group-hover:bg-indigo-600 group-hover:text-white transition-colors uppercase">{t.id}</span></td>
                            <td className="px-6 py-5 text-xs font-black uppercase text-slate-800 tracking-tight">{t.nama}</td>
                            <td className="px-6 py-5">
                               <div className="flex flex-wrap gap-2">
                                  {getMapelArray(t.mapel).map((m, i) => (
                                    <span key={i} className="px-3 py-1 bg-indigo-50 text-indigo-600 rounded-full text-[8px] font-black uppercase tracking-tighter italic">{m}</span>
                                  ))}
                               </div>
                            </td>
                            <td className="px-6 py-5 text-right">
                               <div className="flex items-center justify-end gap-3 opacity-0 group-hover:opacity-100 transition-opacity">
                                  <button onClick={() => { setEditingTeacherId(t.id); setTeacherForm(t); setIsTeacherModalOpen(true); }} className="p-3 bg-white text-indigo-600 border border-slate-100 rounded-xl hover:bg-indigo-50 shadow-sm transition-all active:scale-90"><Edit3 size={16}/></button>
                                  <button onClick={() => handleDeleteTeacher(t.id)} className="p-3 bg-white text-rose-600 border border-slate-100 rounded-xl hover:bg-rose-50 shadow-sm transition-all active:scale-90"><Trash2 size={16}/></button>
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

      {/* SCHEDULE TAB */}
      {activeTab === 'schedule' && isAdmin && (
        <div className="space-y-6 animate-in slide-in-from-bottom-6">
           <div className="bg-white p-10 rounded-[40px] border border-slate-100 shadow-2xl">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 mb-10">
                 <div>
                    <h3 className="text-sm font-black uppercase italic flex items-center gap-3 text-slate-800"><BookText size={24} className="text-indigo-600"/> Matriks Jadwal Pelajaran</h3>
                    <p className="text-[10px] font-black text-slate-400 uppercase mt-1 italic tracking-widest leading-none">Cloud Spreadsheet Data</p>
                 </div>
                 <div className="flex bg-slate-100 p-1.5 rounded-2xl overflow-x-auto no-scrollbar">
                    {['SENIN', 'SELASA', 'RABU', 'KAMIS', 'JUM\'AT', 'SABTU'].map(h => (
                      <button key={h} onClick={() => setScheduleDay(h)} className={`px-5 py-2.5 text-[9px] font-black uppercase rounded-xl transition-all shrink-0 ${scheduleDay === h ? 'bg-white text-indigo-600 shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}>{h}</button>
                    ))}
                 </div>
              </div>
              <div className="overflow-x-auto no-scrollbar">
                 <table className="w-full text-left">
                    <thead><tr className="bg-slate-50/50"><th className="px-8 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Jam</th><th className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase tracking-widest italic">Waktu</th>{CLASSES.map(c => <th key={c.id} className="px-4 py-5 text-[9px] font-black text-slate-400 uppercase text-center italic tracking-widest">{c.id}</th>)}</tr></thead>
                    <tbody className="divide-y divide-slate-50">
                       {schedule.filter(s => s.hari === scheduleDay).map(slot => (
                         <tr key={slot.jam} className="hover:bg-slate-50/30 group">
                            <td className="px-8 py-5 text-xs font-black italic text-slate-400 group-hover:text-indigo-600 transition-colors">#{slot.jam}</td>
                            <td className="px-4 py-5 text-[10px] font-black text-slate-400 italic">{slot.waktu}</td>
                            {CLASSES.map(c => {
                               const m = slot.mapping[c.id] as string;
                               return (
                                 <td key={c.id} className="px-2 py-5 text-center">
                                    {m ? (
                                       <div className="flex flex-col items-center">
                                          <span className="text-[10px] font-black uppercase leading-none mb-1 text-slate-800 tracking-tighter italic">{m.split('-')[0]}</span>
                                          <span className="text-[7px] font-bold text-slate-300 uppercase tracking-tighter leading-none">{m.split('-')[1]}</span>
                                       </div>
                                    ) : <span className="text-slate-200">--</span>}
                                 </td>
                               );
                            })}
                         </tr>
                       ))}
                    </tbody>
                 </table>
              </div>
           </div>
        </div>
      )}

      {/* SETTINGS TAB */}
      {activeTab === 'settings' && isAdmin && (
        <div className="max-w-4xl mx-auto space-y-8 animate-in slide-in-from-bottom-6">
           <div className="bg-white p-12 rounded-[40px] border border-slate-100 shadow-2xl space-y-12">
              <div className="flex items-center gap-6 border-b border-slate-50 pb-8">
                <div className="p-4 bg-indigo-600 text-white rounded-3xl shadow-xl shadow-indigo-100"><Settings size={32}/></div>
                <div><h3 className="text-lg font-black text-slate-900 uppercase italic leading-none">Pengaturan Sistem</h3><p className="text-[10px] font-bold text-slate-400 uppercase tracking-[0.2em] mt-2 italic leading-none tracking-widest">Terintegrasi Cloud API</p></div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                 <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic ml-1 mb-2 block leading-none">Tahun Pelajaran</label><input className="w-full bg-slate-50 border border-slate-100 px-8 py-5 rounded-3xl text-sm font-black outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all uppercase italic text-slate-800" value={settings.tahunPelajaran} onChange={e => setSettings(prev => ({...prev, tahunPelajaran: e.target.value}))}/></div>
                 <div className="space-y-3"><label className="text-[10px] font-black text-slate-400 uppercase tracking-[0.2em] italic ml-1 mb-2 block leading-none">Semester Aktif</label><select className="w-full bg-slate-50 border border-slate-100 px-8 py-5 rounded-3xl text-sm font-black outline-none focus:bg-white focus:ring-4 focus:ring-indigo-50 transition-all uppercase italic text-slate-800" value={settings.semester} onChange={e => setSettings(prev => ({...prev, semester: e.target.value as any}))}><option value="Ganjil">SEMESTER GANJIL</option><option value="Genap">SEMESTER GENAP</option></select></div>
              </div>
              <div className="pt-4"><button onClick={handleSaveSettings} disabled={isSavingSettings} className="w-full bg-indigo-600 text-white font-black py-6 rounded-3xl shadow-2xl shadow-indigo-200 hover:bg-indigo-700 transition-all text-[11px] uppercase tracking-widest flex items-center justify-center gap-4 active:scale-95">{isSavingSettings ? <RefreshCw className="animate-spin" size={20}/> : <Save size={20}/>}{isSavingSettings ? 'MENYIMPAN...' : 'SIMPAN KONFIGURASI'}</button></div>
              <div className="pt-12 border-t border-slate-50 flex flex-col md:flex-row items-center gap-10">
                <div className="p-8 bg-slate-50 text-slate-300 rounded-[40px] shrink-0"><RefreshCw size={40} className={isRestoring ? 'animate-spin' : ''}/></div>
                <div className="flex-1 text-center md:text-left"><h4 className="font-black text-xs uppercase italic mb-3 tracking-widest text-slate-800 leading-none tracking-widest">Reset Master Data Cloud</h4><p className="text-[10px] text-slate-400 mb-8 font-black uppercase leading-relaxed italic tracking-wider">Hanya gunakan fitur ini jika database Cloud kosong atau berantakan. Ini akan mengirimkan data guru & jadwal statis ke Spreadsheet.</p><button onClick={handleRestoreDefaults} disabled={isRestoring} className="bg-slate-900 text-white text-[10px] font-black uppercase px-10 py-4 rounded-2xl hover:bg-slate-800 transition-all active:scale-95">{isRestoring ? 'SEDANG RESTORASI...' : 'RESTORE MASTER DATA'}</button></div>
              </div>
           </div>
        </div>
      )}

      {/* TEACHER MODAL */}
      {isTeacherModalOpen && isAdmin && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-6 bg-slate-900/60 backdrop-blur-md animate-in fade-in">
          <div className="bg-white w-full max-w-lg rounded-[40px] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-300">
             <div className="p-8 bg-indigo-600 flex items-center justify-between text-white"><h3 className="font-black uppercase italic tracking-widest leading-none">{editingTeacherId ? 'Edit Data Guru' : 'Tambah Guru Baru'}</h3><button onClick={() => setIsTeacherModalOpen(false)} className="p-2 hover:bg-white/10 rounded-full transition-all active:scale-75"><X size={20}/></button></div>
             <form onSubmit={handleSaveTeacher} className="p-10 space-y-6">
                <div><label className="text-[10px] font-black text-slate-400 uppercase italic ml-1 mb-2 block leading-none tracking-widest">Kode Singkatan</label><input type="text" required maxLength={4} className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black uppercase italic text-xs outline-none focus:bg-white" placeholder="MISAL: MH" value={teacherForm.id} onChange={e => setTeacherForm({...teacherForm, id: e.target.value.toUpperCase()})} readOnly={!!editingTeacherId}/></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase italic ml-1 mb-2 block leading-none tracking-widest">Nama & Gelar Lengkap</label><input type="text" required className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black text-xs outline-none focus:bg-white uppercase italic text-slate-800" placeholder="MISAL: MOCH. HUSAIN RIFAI, S.Pd." value={teacherForm.nama} onChange={e => setTeacherForm({...teacherForm, nama: e.target.value})}/></div>
                <div><label className="text-[10px] font-black text-slate-400 uppercase italic ml-1 mb-2 block leading-none tracking-widest">Mata Pelajaran (Pisah dengan koma)</label><input type="text" className="w-full bg-slate-50 border border-slate-100 px-6 py-4 rounded-2xl font-black text-xs outline-none focus:bg-white uppercase italic text-slate-800" placeholder="MISAL: Penjas Orkes, Informatika" value={getMapelArray(teacherForm.mapel).join(', ')} onChange={e => setTeacherForm({...teacherForm, mapel: e.target.value.split(',').map(s => s.trim())})}/></div>
                <div className="pt-4"><button type="submit" className="w-full bg-indigo-600 text-white font-black py-5 rounded-[22px] shadow-xl hover:bg-indigo-700 transition-all text-[11px] uppercase tracking-widest flex items-center justify-center gap-3 active:scale-95"><Save size={18}/> SIMPAN DATA GURU</button></div>
             </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminDashboard;