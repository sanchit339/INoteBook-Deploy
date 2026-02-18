import Notes from './Notes'

const Home = (props) => {
  // destructuring
  const {showAlert} = props;
  return (
    <div>
        <Notes showAlert={showAlert}/>
    </div>
  )
}

export default Home