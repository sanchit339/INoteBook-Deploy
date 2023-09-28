const express = require('express')
const router = express.Router();
const Note = require('../modules/Notes');
const { body, validationResult } = require('express-validator');

 
var fetchuser = require('../middleware/fetchuser')

//Route 1 : Get All the Notes using GET : "/api/notes/getUser" login required   
router.get('/fetchallnotes' ,fetchuser, async (req , res)=>{
    try {
        const notes = await Note.find({user: req.user.id});
        res.json(notes);
    }catch (error) {
        console.error(error.message); 
        res.status(500).send("some error occured");
    }
})

//Route 2 : adding Notes Post : "/api/notes/PostNotes" login required
router.post('/postNotes' ,fetchuser,[
    body('title' , "enter a valid title").isLength({ min: 5 }) ,    // after name we can send custom message 
    body('description' , "enter a min description of 5 words").isLength({min:5}),] , async (req , res)=>{  // validation for empty note // ***** these are check field ******
    
    try{
        const {title,description,tag} = req.body;
        // if there is any error it will return it here
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
          return res.status(400).json({ errors: errors.array() });
        }
        const note = new Note({
            title , description , tag , user : req.user.id 
        })
        const saveNote = await note.save()
        res.json(saveNote);
    }catch (error) {
        console.error(error.message); 
        res.status(500).send("some error occured");
    }
})

//Route 3 : update existing Notes Put : "/api/notes/update" login required
// we require NoteId for updating the particular note
router.put('/updateNote/:id' ,fetchuser,async(req,res)=>{
    // take the note details
    const {title , description , tag} = req.body;

    try{
    const newNote = {};
    if(title){newNote.title = title};
    if(description){newNote.description = description};
    if(tag){newNote.tag = tag};

    // find the note to be updated and upadate it  (inbuilt function)
    let note = await Note.findById(req.params.id); // from the id 
    if(!note){return res.status(404).send("Not Found")}

    if(note.user.toString() !== req.user.id){ // if other user tries to acces your notes
        return res.status(401).send("Not allowed");
    }

        note = await Note.findByIdAndUpdate(req.params.id , {$set : newNote} , {new : true}) // if new content is there then mark it true 
        res.json({note});
    }catch (error) {
        console.error(error.message); 
        res.status(500).send("some error occured");
    } 
    })


//Route 4 : delete existing Note delete : "/api/notes/delete" login required
    router.delete('/deletenote/:id' ,fetchuser,async(req,res)=>{

        try{
        // find the note to be deleted
        let note = await Note.findById(req.params.id); // from the id 
        if(!note){return res.status(404).send("Not Found")}
        
        // Allow deletion only if user owns this Note
        if(note.user.toString() !== req.user.id){ 
            return res.status(401).send("Not allowed");
        }
    
        note = await Note.findByIdAndDelete(req.params.id); // only one parameter required
        res.json({"Success":"Note has been deleted", note: note }); // providing the note that has been deleted
    } catch (error) {
        console.error(error.message); 
        res.status(500).send("some error occured");
    } 
    })

module.exports = router