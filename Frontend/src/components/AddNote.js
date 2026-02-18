import React, { useContext, useState } from 'react';
import noteContext from '../context/notes/noteContext';

const AddNote = ({ showAlert }) => {
  const context = useContext(noteContext);
  const { addNote } = context;
  const [note, setNote] = useState({ title: '', description: '', tag: '' });

  const handleClick = (event) => {
    event.preventDefault();
    addNote(note.title, note.description, note.tag);
    setNote({ title: '', description: '', tag: '' });
    showAlert('Note added successfully', 'success');
  };

  const onChange = (event) => {
    setNote({ ...note, [event.target.name]: event.target.value });
  };

  const isInvalid = note.title.length < 5 || note.description.length < 5 || note.tag.length < 3;

  return (
    <section className="card notes-panel add-note-panel">
      <h2>Add a note</h2>
      <p className="section-subtitle">Document the idea while it is still fresh.</p>
      <form className="notes-form">
        <div>
          <label htmlFor="title">Title</label>
          <input id="title" name="title" value={note.title} onChange={onChange} minLength={5} required />
        </div>
        <div>
          <label htmlFor="description">Description</label>
          <textarea id="description" name="description" value={note.description} onChange={onChange} minLength={5} required />
        </div>
        <div>
          <label htmlFor="tag">Tag</label>
          <input id="tag" name="tag" value={note.tag} onChange={onChange} minLength={3} required />
        </div>
        <button disabled={isInvalid} type="submit" className="btn-primary" onClick={handleClick}>
          Add note
        </button>
      </form>
    </section>
  );
};

export default AddNote;
