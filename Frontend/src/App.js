import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { useState } from 'react';
import NavBar from './components/NavBar';
import Home from './components/Home';
import About from './components/About';
import NoteState from './context/notes/noteState';
import Alert from './components/Alert';
import Login from './components/Login';
import Signup from './components/Signup';
import FileBrowser from './components/FileBrowser';

function App() {
  const [alert, setAlert] = useState(null);

  const showAlert = (message, type) => {
    setAlert({ msg: message, type });
    setTimeout(() => {
      setAlert(null);
    }, 2200);
  };

  return (
    <NoteState>
      <BrowserRouter>
        <div className="app-shell">
          <NavBar />
          <Alert alert={alert} />
          <main className="page-container">
            <Routes>
              <Route path="/" element={<Home showAlert={showAlert} />} />
              <Route path="about/*" element={<About />} />
              <Route path="login/*" element={<Login showAlert={showAlert} />} />
              <Route path="signup/*" element={<Signup showAlert={showAlert} />} />
              <Route path="code/*" element={<FileBrowser />} />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
    </NoteState>
  );
}

export default App;
