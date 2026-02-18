import React, { useContext, useEffect, useRef , useState } from 'react' // bought through rafc
import { useNavigate } from 'react-router-dom';
import noteContext from '../context/notes/noteContext';
import AddNote from './AddNote';
import NoteItem from './NoteItem';
const Notes = (props) => {
 
  // useContext bring this through es7 snippet 
  const context = useContext(noteContext);
  const {notes , getNotes , editNote} = context ; // destructuring
  let navigation = useNavigate();
  useEffect(()=>{
    // here we will implement the authentication 
    if(localStorage.getItem('token')){
      getNotes();
    } else{
      navigation("/login");
    }
    // eslint-disable-next-line 
  },[])
  const ref = useRef(null);
  const refClose = useRef(null);
  const[note ,setNote] = useState({id : "" , etitle: "" , edescription : "" , etag : "" })

  const updateNote = (currentNote)=>{
      ref.current.click();
      setNote({id : currentNote._id , etitle : currentNote.title , edescription : currentNote.description , etag : currentNote.tag});
  }

  const handleClick = (eve)=>{
    // console.log("updating the note ... " , note);
    editNote(note.id , note.etitle , note.edescription , note.etag);
    refClose.current.click();
    props.showAlert("Updated Successfully" , "success");
  }
    
  const onChange = (eve)=>{ //event 
    setNote({...note , [eve.target.name]: eve.target.value})  // change the note of the name -- value of the note 
  }

  return (
    //modal
    <>
    <AddNote showAlert = {props.showAlert}/>
    <button type="button" ref={ref} className="btn btn-primary d-none" data-bs-toggle="modal" data-bs-target="#exampleModal">
        Launch demo modal
      </button>
        <div className="modal fade" id="exampleModal" tabIndex="-1" aria-labelledby="exampleModalLabel" aria-hidden="true">
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title" id="exampleModalLabel">Edit Note</h5>
                <button type="button" className="btn-close" data-bs-dismiss="modal" aria-label="Close"></button>
              </div>
              <div className="modal-body">
              <form className='my-3'>
                <div className="mb-3">
                  <label htmlFor="exampleInputEmail1">Title</label>
                  <input type="text" className="form-control" id="etitle" name = "etitle" value={note.etitle} onChange={onChange} aria-describedby="emailHelp" placeholder="Enter Title" minLength={5} required/>
                  </div>
                    <div className="form-group mb-3">
                    <label htmlFor="description">Description</label>
                    <input type="text" className="form-control" id="edescription" name="edescription" value={note.edescription} onChange={onChange} placeholder="Description" minLength={5} required/>
                    </div>
                    <div className="form-group mb-3">
                    <label htmlFor="tag">Tag</label>
                    <input type="text" className="form-control" id="etag" name="etag" value={note.etag} onChange={onChange} placeholder="Tag" minLength={3} required/>
                    </div> 
                  </form>
              </div>
              <div className="modal-footer">
                <button ref = {refClose} type="button" className="btn btn-secondary" data-bs-dismiss="modal">Close</button>
                <button disabled = {note.etitle<5 || note.edescription<5 || note.etag<3} onClick={handleClick} type="button" className="btn btn-primary">Update Note</button>
              </div>
            </div>
          </div>
        </div>

      <div className="container row my-2 ">
      <h2> Your  Note </h2>
      <div className='container mx-1'>
      {notes.length === 0 && 'No Notes to display'}
      </div>
      {notes.map((note)=>{
        return <NoteItem key = {note._id} updateNote={updateNote} showAlert = {props.showAlert} note = {note}/>;  // and pass the props from this 
      })}
      </div>
    </>
  )
}

export default Notes
