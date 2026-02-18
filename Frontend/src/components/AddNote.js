import React, { useContext , useState } from 'react' // bought through rafc
import noteContext from '../context/notes/noteContext';


const AddNote = (props) => {

  const context = useContext(noteContext);
  const {addNote} = context ; // destructuring

  const[note ,setNote] = useState({title: "" , description : "" , tag : "" }) // bracket me initial state

  const handleClick = (eve)=>{
      eve.preventDefault();
      addNote(note.title , note.description , note.tag);
      setNote({title: "" , description : "" , tag : "" });
      props.showAlert("Note Added Successfully" , "success");
  }
  // } minLength={5} required)
    
  const onChange = (eve)=>{ //event 
    setNote({...note , [eve.target.name]: eve.target.value})  // change the note of the name -- value of the note 
  }
  return (
    <div className="container my-3">
      <h1> Add a Note </h1>
      <form className='my-3'>
      <div className="mb-3">
        <label htmlFor="exampleInputEmail1">Title</label>
        <input type="text" className="form-control" id="title" name = "title" onChange={onChange} value = {note.title} aria-describedby="emailHelp" placeholder="Enter Title" minLength={5} required/>
        </div>
          <div className="form-group mb-3">
          <label htmlFor="description">Description</label>
          <input type="text" className="form-control" id="description" name="description" onChange={onChange} value = {note.description} placeholder="Description" minLength={5} required/>
          </div>
          <div className="form-group mb-3">
          <label htmlFor="tag">Tag</label>
          <input type="text" className="form-control" id="tag" name="tag" onChange={onChange} value = {note.tag} placeholder="Tag" minLength={3} required/>
          </div>
        <button disabled = {note.title<5 || note.description<5 || note.tag<3} type="submit" className="btn btn-primary" onClick={handleClick}>Add Note</button>
        </form>
    </div>
  )
}


export default AddNote 
