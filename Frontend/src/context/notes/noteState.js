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
    // console.log(json)
    setNotes(json)
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
    // todo api call
    const response = await fetch(`${host}/api/notes/deletenote/${id}`, {
      method: 'DELETE', // *GET, POST, PUT, DELETE, etc.
      headers: {
        'Content-Type': 'application/json',
        'auth-token': localStorage.getItem('token')
      }
    });
    // Response handled, no need to parse json
    const newNote = notes.filter((note) => { return note._id !== id });
    setNotes(newNote)
  }

  // edit the note
  const editNote = async (id, title, description, tag) => {
    // api call  (bought from fetch api with header)
    const response = await fetch(`${host}/api/notes/updateNote/${id}`, {
      method: 'PUT', // *GET, POST, PUT, DELETE, etc.
      headers: {
        'Content-Type': 'application/json',
        'auth-token': localStorage.getItem('token')
      },
      body: JSON.stringify({ title, description, tag }) // body data type must match "Content-Type" header
    });
    // Response handled, updating local state
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
