import { useState } from 'react';
import { Sidebar } from './components/Sidebar';
import { TopBar } from './components/TopBar';
import { Overview } from './components/Overview';
import { PipelineWorkspace } from './components/PipelineWorkspace';
import { Artists } from './components/Artists';
import { Calendar } from './components/Calendar';

export default function App() {
  const [currentPage, setCurrentPage] = useState('overview');
  const [pipelineData, setPipelineData] = useState<any>(null);

  const handleLoadJson = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target?.result as string);
        setPipelineData(json);
      } catch (error) {
        console.error('Failed to parse JSON:', error);
        alert('Invalid JSON file');
      }
    };
    reader.readAsText(file);
    event.target.value = '';
  };

  const renderPage = () => {
    switch (currentPage) {
      case 'overview':
        return <Overview data={pipelineData} />;
      case 'workspace':
        return <PipelineWorkspace data={pipelineData} />;
      case 'artists':
        return <Artists data={pipelineData} />;
      case 'calendar':
        return <Calendar data={pipelineData} />;
      default:
        return <Overview data={pipelineData} />;
    }
  };

  return (
    <div className="size-full flex bg-zinc-950">
      <Sidebar currentPage={currentPage} onPageChange={setCurrentPage} />

      <div className="flex-1 flex flex-col overflow-hidden">
        <TopBar
          onLoadJson={handleLoadJson}
          projectName={pipelineData?.project?.name}
        />

        <div className="flex-1 overflow-hidden bg-zinc-950">
          {renderPage()}
        </div>
      </div>
    </div>
  );
}