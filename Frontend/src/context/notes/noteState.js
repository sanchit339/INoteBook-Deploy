import { useState } from "react";
import NoteContext from "./noteContext";

const NoteState = (props) => {
  const host = process.env.REACT_APP_BACKEND_URL || "http://localhost:4001"
  // updating the note initial with the fetch api
  const notesInitial = []
  const [notes, setNotes] = useState(notesInitial);

  // Get All notes

  const getNotes = async () => {
    // api call  (bought from fetch api with header) to fetch all notes
    const response = await fetch(`${host}/api/notes/fetchallnotes`, {
      method: 'GET', // *GET, POST, PUT, DELETE, etc.
      headers: {
        'Content-Type': 'application/json',
        'auth-token': localStorage.getItem('token')
      },
    });
    const json = await response.json()
    // Ensure we only set notes if response is valid array
    if (Array.isArray(json)) {
      setNotes(json)
    } else {
      // API returned error (e.g., 401), keep notes as empty array
      console.error('Failed to fetch notes:', json);
      setNotes([]);
    }
  }

  // the methods will be followed from here 

  // add note

  const addNote = async (title, description, tag) => {
    // todo api call
    // api call  (bought from fetch api with header)
    const response = await fetch(`${host}/api/notes/postNotes`, {
      method: 'POST', // *GET, POST, PUT, DELETE, etc.
      headers: {
        'Content-Type': 'application/json',
        'auth-token': localStorage.getItem('token')
      },
      body: JSON.stringify({ title, description, tag }) // body data type must match "Content-Type" header
    });
    const note = await response.json();
    setNotes(notes.concat(note))
  }
  // delete note
  const deleteNote = async (id) => {
    // API call to delete note
    await fetch(`${host}/api/notes/deletenote/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        'auth-token': localStorage.getItem('token')
      }
    });
    // Update local state
    const newNote = notes.filter((note) => { return note._id !== id });
    setNotes(newNote)
  }

  // edit the note
  const editNote = async (id, title, description, tag) => {
    // API call to update note
    await fetch(`${host}/api/notes/updateNote/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        'auth-token': localStorage.getItem('token')
      },
      body: JSON.stringify({ title, description, tag })
    });
    // Update local state
    let newNotes = JSON.parse(JSON.stringify(notes));
    // logic 
    for (let index = 0; index < notes.length; index++) {
      const element = newNotes[index];
      if (element._id === id) {
        newNotes[index].title = title;
        newNotes[index].description = description;
        newNotes[index].tag = tag;
        break;
      }
    }
    setNotes(newNotes);
  }
  // with this we can update the notes too
  return (
    <NoteContext.Provider value={{ notes, addNote, deleteNote, editNote, getNotes }}>
      {props.children}
    </NoteContext.Provider>
  )
}

export default NoteState;
