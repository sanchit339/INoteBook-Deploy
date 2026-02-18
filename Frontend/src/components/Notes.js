import React, { useContext, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import noteContext from '../context/notes/noteContext';
import AddNote from './AddNote';
import NoteItem from './NoteItem';

const Notes = ({ showAlert }) => {
  const context = useContext(noteContext);
  const { notes, getNotes, editNote } = context;
  const navigation = useNavigate();

  const [note, setNote] = useState({ id: '', etitle: '', edescription: '', etag: '' });
  const [isEditorOpen, setIsEditorOpen] = useState(false);

  useEffect(() => {
    if (localStorage.getItem('token')) {
      getNotes();
    } else {
      navigation('/login');
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const updateNote = (currentNote) => {
    setNote({
      id: currentNote._id,
      etitle: currentNote.title,
      edescription: currentNote.description,
      etag: currentNote.tag,
    });
    setIsEditorOpen(true);
  };

  const handleClick = () => {
    editNote(note.id, note.etitle, note.edescription, note.etag);
    setIsEditorOpen(false);
    showAlert('Updated successfully', 'success');
  };

  const onChange = (event) => {
    setNote({ ...note, [event.target.name]: event.target.value });
  };

  const isUpdateInvalid =
    note.etitle.length < 5 || note.edescription.length < 5 || note.etag.length < 3;

  return (
    <section className="notes-layout">
      <AddNote showAlert={showAlert} />

      <section className="card notes-panel notes-list-panel">
        <div className="notes-list-head">
          <h2>Your notes</h2>
          <p>{notes.length === 0 ? 'No notes yet.' : `${notes.length} note(s) available`}</p>
        </div>

        <div className="notes-grid">
          {notes.map((item) => (
            <NoteItem key={item._id} updateNote={updateNote} showAlert={showAlert} note={item} />
          ))}
        </div>
      </section>

      {isEditorOpen && (
        <div className="edit-overlay" role="dialog" aria-modal="true">
          <div className="card edit-dialog">
            <h3>Edit note</h3>
            <div className="notes-form">
              <div>
                <label htmlFor="etitle">Title</label>
                <input id="etitle" name="etitle" value={note.etitle} onChange={onChange} />
              </div>
              <div>
                <label htmlFor="edescription">Description</label>
                <textarea
                  id="edescription"
                  name="edescription"
                  value={note.edescription}
                  onChange={onChange}
                />
              </div>
              <div>
                <label htmlFor="etag">Tag</label>
                <input id="etag" name="etag" value={note.etag} onChange={onChange} />
              </div>
            </div>
            <div className="edit-dialog__actions">
              <button className="btn-ghost" onClick={() => setIsEditorOpen(false)}>
                Cancel
              </button>
              <button className="btn-primary" disabled={isUpdateInvalid} onClick={handleClick}>
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};

export default Notes;
