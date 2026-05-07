import { useMemo, useState } from 'react';
import { List, Calendar as CalendarIcon, ChevronLeft, ChevronRight } from 'lucide-react';
import { StatusBadge } from './StatusBadge';

interface PipelineData {
  assets: any[];
  sets: any[];
  shots: any[];
}

interface CalendarProps {
  data: PipelineData | null;
}

interface Publication {
  date: string;
  time: string;
  type: 'asset' | 'set' | 'shot';
  entity: string;
  task: string;
  artist: string;
  status: 'wip' | 'ready' | 'final';
}

export function Calendar({ data }: CalendarProps) {
  const [viewMode, setViewMode] = useState<'list' | 'month'>('list');
  const [currentMonth, setCurrentMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });

  const publications = useMemo(() => {
    if (!data) return [];

    const pubs: Publication[] = [];

    data.assets.forEach((asset) => {
      Object.entries(asset.tasks || {}).forEach(([taskName, task]: [string, any]) => {
        if (task.published_at) {
          const [date, time] = task.published_at.split(' ');
          pubs.push({
            date,
            time,
            type: 'asset',
            entity: asset.name,
            task: taskName,
            artist: task.artist,
            status: task.status,
          });
        }
      });
    });

    data.sets.forEach((set) => {
      Object.entries(set.tasks || {}).forEach(([taskName, task]: [string, any]) => {
        if (task.published_at) {
          const [date, time] = task.published_at.split(' ');
          pubs.push({
            date,
            time,
            type: 'set',
            entity: set.name,
            task: taskName,
            artist: task.artist,
            status: task.status,
          });
        }
      });
    });

    data.shots.forEach((shot) => {
      Object.entries(shot.tasks || {}).forEach(([taskName, task]: [string, any]) => {
        if (task.published_at) {
          const [date, time] = task.published_at.split(' ');
          pubs.push({
            date,
            time,
            type: 'shot',
            entity: shot.name,
            task: taskName,
            artist: task.artist,
            status: task.status,
          });
        }
      });
    });

    return pubs.sort((a, b) => {
      const dateA = new Date(`${a.date} ${a.time}`);
      const dateB = new Date(`${b.date} ${b.time}`);
      return dateB.getTime() - dateA.getTime();
    });
  }, [data]);

  const groupedByDate = useMemo(() => {
    const grouped: Record<string, Publication[]> = {};
    publications.forEach((pub) => {
      if (!grouped[pub.date]) {
        grouped[pub.date] = [];
      }
      grouped[pub.date].push(pub);
    });
    return grouped;
  }, [publications]);

  if (!data) {
    return (
      <div className="flex items-center justify-center h-full text-zinc-500">
        <p>Load a JSON file to view calendar</p>
      </div>
    );
  }

  const typeColors = {
    asset: 'bg-purple-500/20 text-purple-400 border-purple-500/30',
    set: 'bg-cyan-500/20 text-cyan-400 border-cyan-500/30',
    shot: 'bg-orange-500/20 text-orange-400 border-orange-500/30',
  };

  const monthView = useMemo(() => {
    const year = currentMonth.year;
    const month = currentMonth.month;

    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDay.getDay();
    const daysInMonth = lastDay.getDate();

    const days: Array<{ date: number; publications: Publication[] }> = [];

    for (let i = 0; i < startingDayOfWeek; i++) {
      days.push({ date: 0, publications: [] });
    }

    for (let day = 1; day <= daysInMonth; day++) {
      const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      const dayPubs = groupedByDate[dateStr] || [];
      days.push({ date: day, publications: dayPubs });
    }

    return { year, month, days };
  }, [currentMonth, groupedByDate]);

  const navigateMonth = (direction: 'prev' | 'next') => {
    setCurrentMonth((prev) => {
      const newDate = new Date(prev.year, prev.month + (direction === 'next' ? 1 : -1), 1);
      return { year: newDate.getFullYear(), month: newDate.getMonth() };
    });
  };

  const monthNames = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

  return (
    <div className="h-full overflow-auto p-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-xl font-medium text-white">Publication Timeline</h2>
        <div className="flex gap-1 bg-zinc-900 border border-zinc-800 p-0.5">
          <button
            onClick={() => setViewMode('list')}
            className={`px-3 py-1.5 text-xs transition-colors ${viewMode === 'list' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`}
          >
            <List size={14} />
          </button>
          <button
            onClick={() => setViewMode('month')}
            className={`px-3 py-1.5 text-xs transition-colors ${viewMode === 'month' ? 'bg-zinc-800 text-white' : 'text-zinc-500 hover:text-white'}`}
          >
            <CalendarIcon size={14} />
          </button>
        </div>
      </div>

      {viewMode === 'list' ? (
        <div className="space-y-4">
          {Object.entries(groupedByDate).map(([date, pubs]) => (
            <div key={date}>
              <div className="text-xs font-medium text-zinc-500 uppercase tracking-wide mb-2 sticky top-0 bg-zinc-950 py-1">
                {date}
              </div>

              <div className="space-y-1">
                {pubs.map((pub, index) => (
                  <div
                    key={index}
                    className="flex items-center gap-2 px-3 py-2 bg-zinc-900 border border-zinc-800 rounded hover:border-zinc-700 transition-colors text-xs"
                  >
                    <div className="text-zinc-500 font-mono w-12">{pub.time}</div>
                    <span className={`px-1.5 py-0.5 border text-xs font-medium ${typeColors[pub.type]}`}>
                      {pub.type}
                    </span>
                    <div className="flex-1 text-zinc-300">
                      <span className="font-medium">{pub.entity}</span>
                      <span className="text-zinc-500 mx-1.5">/</span>
                      <span>{pub.task}</span>
                    </div>
                    <div className="text-zinc-400 text-xs">{pub.artist}</div>
                    <StatusBadge status={pub.status} />
                  </div>
                ))}
              </div>
            </div>
          ))}

          {publications.length === 0 && (
            <div className="flex items-center justify-center h-64 text-zinc-500">
              <p>No publications found</p>
            </div>
          )}
        </div>
      ) : (
        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-lg font-medium text-white">
              {monthNames[monthView.month]} {monthView.year}
            </div>
            <div className="flex gap-1">
              <button
                onClick={() => navigateMonth('prev')}
                className="p-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors rounded"
              >
                <ChevronLeft size={16} className="text-zinc-400" />
              </button>
              <button
                onClick={() => navigateMonth('next')}
                className="p-1.5 bg-zinc-900 border border-zinc-800 hover:bg-zinc-800 transition-colors rounded"
              >
                <ChevronRight size={16} className="text-zinc-400" />
              </button>
            </div>
          </div>
          {publications.length > 0 ? (
            <>
              <div className="grid grid-cols-7 gap-px bg-zinc-800 border border-zinc-800 rounded overflow-hidden">
                {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((day) => (
                  <div key={day} className="bg-zinc-900 px-2 py-2 text-xs font-medium text-zinc-500 text-center">
                    {day}
                  </div>
                ))}
                {monthView.days.map((day, index) => (
                  <div
                    key={index}
                    className={`bg-zinc-950 min-h-24 p-2 ${day.date === 0 ? 'bg-zinc-900/30' : ''}`}
                  >
                    {day.date > 0 && (
                      <>
                        <div className="text-xs text-zinc-400 mb-1">{day.date}</div>
                        <div className="space-y-1">
                          {day.publications.map((pub, pubIndex) => (
                            <div
                              key={pubIndex}
                              className="text-xs px-1.5 py-0.5 bg-zinc-900 border border-zinc-800 rounded truncate"
                              title={`${pub.entity} / ${pub.task} - ${pub.artist}`}
                            >
                              <span className={`inline-block w-1.5 h-1.5 rounded-full mr-1 ${
                                pub.status === 'wip' ? 'bg-amber-500' :
                                pub.status === 'ready' ? 'bg-blue-500' :
                                'bg-emerald-500'
                              }`}></span>
                              <span className="text-zinc-400">{pub.entity}</span>
                            </div>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                ))}
                </div>
            </>
          ) : (
            <div className="flex items-center justify-center h-64 text-zinc-500">
              <p>No publications found</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
