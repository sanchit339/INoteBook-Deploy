import React, { useContext } from 'react';
import { FaRegPenToSquare, FaRegTrashCan } from 'react-icons/fa6';
import noteContext from '../context/notes/noteContext';

const NoteItem = ({ note, updateNote, showAlert }) => {
  const context = useContext(noteContext);
  const { deleteNote } = context;

  return (
    <article className="card note-card">
      <div className="note-card__head">
        <h4>{note.title}</h4>
        <div className="note-card__actions">
          <button
            className="icon-btn"
            onClick={() => {
              updateNote(note);
            }}
            aria-label="Edit note"
          >
            <FaRegPenToSquare />
          </button>
          <button
            className="icon-btn danger"
            onClick={() => {
              deleteNote(note._id);
              showAlert('Deleted successfully', 'success');
            }}
            aria-label="Delete note"
          >
            <FaRegTrashCan />
          </button>
        </div>
      </div>
      <p>{note.description}</p>
      <span className="note-tag">#{note.tag || 'general'}</span>
    </article>
  );
};

export default NoteItem;
