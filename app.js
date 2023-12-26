const express = require('express')
const app = express()
module.exports = app
app.use(express.json())

const {open} = require('sqlite')
const sqlite3 = require('sqlite3')

const bcrypt = require('bcrypt')
const jwt = require('jsonwebtoken')

const path = require('path')
const dbPath = path.join(__dirname, 'covid19IndiaPortal.db')

let db = null

const initializeServerAndDb = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    })
    let port = 3000
    app.listen(port, () => {
      console.log(`Server is Running in ${port} Port...`)
    })
  } catch (error) {
    console.log(`Db Error: ${error.message}`)
    process.exit(1)
  }
}

initializeServerAndDb()

const authentication = async (request, response, next) => {
  let jwtToken
  const authToken = request.headers['authorization']
  if (authToken !== undefined) {
    jwtToken = authToken.split(' ')[1]
  }
  if (jwtToken !== undefined) {
    await jwt.verify(jwtToken, 'MY_SECRET_KEY', (error, payload) => {
      if (error) {
        response.status(401)
        response.send('Invalid JWT Token')
      } else {
        next()
        payload.username = request.username
      }
    })
  } else {
    response.status(401)
    response.send('Invalid JWT Token')
  }
}

// Api 1 : Login user + auth generate

app.post('/login/', async (request, response) => {
  const {username, password} = request.body
  const findUserRegisteredOrNot = `SELECT * FROM user WHERE username = '${username}'`
  const dbUserSearch = await db.get(findUserRegisteredOrNot)

  if (dbUserSearch !== undefined) {
    const decryptPassword = await bcrypt.compare(
      password,
      dbUserSearch.password,
    )
    if (decryptPassword === true) {
      const payload = {username: username}
      jwtToken = await jwt.sign(payload, 'MY_SECRET_KEY')
      response.send({jwtToken})
    } else if (decryptPassword === false) {
      response.status(400)
      response.send('Invalid password')
    }
  } else {
    response.status(400)
    response.send('Invalid user')
  }
})

// Api 2: Returns a list of all states in the state table + auth

const stateKeyCase = object => {
  return {
    stateId: object.state_id,
    stateName: object.state_name,
    population: object.population,
  }
}

app.get('/states/', authentication, async (request, response) => {
  const getAllStates = `SELECT * FROM state;`
  const allStatesResult = await db.all(getAllStates)
  response.send(
    allStatesResult.map(eachStateOject => stateKeyCase(eachStateOject)),
  )
})

// Api 3: Returns a state based on the state ID + auth

let requiredStateKeyCase = stateSingleObject => {
  return {
    stateId: stateSingleObject.state_id,
    stateName: stateSingleObject.state_name,
    population: stateSingleObject.population,
  }
}

app.get('/states/:stateId/', authentication, async (request, response) => {
  const {stateId} = request.params

  const getState = `SELECT * FROM state WHERE state_id = ${stateId};`
  const stateResult = await db.get(getState)
  response.send(requiredStateKeyCase(stateResult))
})

//Api 4: Create a district in the district table, district_id is auto-incremented + auth

app.post('/districts/', authentication, async (request, response) => {
  const {districtName, stateId, cases, cured, active, deaths} = request.body

  const addDistrict = `INSERT INTO district(district_name,state_id,cases,cured,active,deaths)
  VALUES('${districtName}', ${stateId}, ${cases}, ${cured}, ${active}, ${deaths})`

  await db.run(addDistrict)
  response.send('District Successfully Added')
})

//Api 5: Returns a district based on the district ID + auth

let requiredDisctrictKeyCase = districtSingleObject => {
  return {
    districtId: districtSingleObject.district_id,
    districtName: districtSingleObject.district_name,
    stateId: districtSingleObject.state_id,
    cases: districtSingleObject.cases,
    cured: districtSingleObject.cured,
    active: districtSingleObject.active,
    deaths: districtSingleObject.deaths,
  }
}

app.get(
  '/districts/:districtId/',
  authentication,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrict = `SELECT * FROM district WHERE district_id = ${districtId};`
    const districtResult = await db.get(getDistrict)
    response.send(requiredDisctrictKeyCase(districtResult))
  },
)

//Api 6: Deletes a district from the district table based on the district ID + auth

app.delete(
  '/districts/:districtId/',
  authentication,
  async (request, response) => {
    const {districtId} = request.params
    const getDistrict = `DELETE FROM district WHERE district_id = ${districtId};`
    const districtResult = await db.run(getDistrict)
    response.send('District Removed')
  },
)

//Api 7: Updates the details of a specific district based on the district ID + auth

app.put(
  '/districts/:districtId/',
  authentication,
  async (request, response) => {
    const {districtId} = request.params
    const {districtName, stateId, cases, cured, active, deaths} = request.body

    const updateDistrict = `
  UPDATE district 
  SET 
  district_name = '${districtName}',
  state_id = ${stateId},
  cases = ${cases},
  cured = ${cured},
  active = ${active},
  deaths = ${deaths}
  WHERE district_id = ${districtId};`

    await db.run(updateDistrict)
    response.send('District Details Updated')
  },
)

// Api 8: Returns the statistics of total cases, cured, active, deaths of a specific state based on state ID + auth

app.get(
  '/states/:stateId/stats/',
  authentication,
  async (request, response) => {
    const {stateId} = request.params
    const statsQuery = `SELECT SUM(cases),SUM(cured),SUM(active),SUM(deaths)
  FROM district WHERE state_id=${stateId};`
    const stats = await db.get(statsQuery)
    response.send({
      totalCases: stats['SUM(cases)'],
      totalCured: stats['SUM(cured)'],
      totalActive: stats['SUM(active)'],
      totalDeaths: stats['SUM(deaths)'],
    })
  },
)
