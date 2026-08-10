import './App.css';
import {
  BrowserRouter,
  Routes,
  Route,
  Navigate,
  useLocation,
} from "react-router-dom";
import NavBar from './components/NavBar';
import Home from './components/Home';
import About from './components/About';
import NoteState from './context/notes/noteState';
import Alert from './components/Alert';
import Login from './components/Login';
import Signup from './components/Signup';
import { useState } from 'react';
import FileBrowser from './components/FileBrowser';

function AppLayout({ showAlert, alert }) {
  const location = useLocation();
  const isWorkbench =
    location.pathname.startsWith('/resource') ||
    location.pathname.startsWith('/code');

  return (
    <>
      {!isWorkbench && <NavBar />}
      {!isWorkbench && <Alert alert={alert} />}
      <div className={isWorkbench ? 'workbench-shell' : 'container'}>
        <Routes>
          <Route path="/" element={<Home showAlert={showAlert} />} />
          <Route path="about/*" element={<About />} />
          <Route path="login/*" element={<Login showAlert={showAlert} />} />
          <Route path="signup/*" element={<Signup showAlert={showAlert} />} />
          <Route path="resource/*" element={<FileBrowser />} />
          <Route path="code/*" element={<Navigate to="/resource" replace />} />
        </Routes>
      </div>
    </>
  );
}

function App() {
  const [alert, setAlert] = useState(null);
  const showAlert = (message, type) => {
    setAlert({
      msg: message,
      type: type
    });
    setTimeout(() => {
      setAlert(null);
    }, 2000);
  };

  return (
    <NoteState>
      <BrowserRouter>
        <AppLayout showAlert={showAlert} alert={alert} />
      </BrowserRouter>
    </NoteState>
  );
}

export default App;
