const DEFAULT_API_URL = 'https://randomuser.me/api/?results=500';

function generateMockUser(index) {
  const gender = index % 2 === 0 ? 'male' : 'female';
  const firstName = gender === 'male' ? `John${index}` : `Jane${index}`;
  const lastName = `Doe${index}`;
  const country = index % 3 === 0 ? 'USA' : (index % 3 === 1 ? 'Canada' : 'Mexico');
  const city = index % 2 === 0 ? 'New York' : 'Los Angeles';
  const registeredDate = new Date(Date.now() - (index * 86400000)).toISOString(); // Days ago

  return {
    id: { value: `mock-id-${index}-${Math.random().toString(36).substr(2, 9)}` },
    name: { first: firstName, last: lastName },
    email: `${firstName.toLowerCase()}.${lastName.toLowerCase()}@example.com`,
    phone: `555-0101-${String(index).padStart(2, '0')}`,
    location: { country, city },
    registered: { date: registeredDate },
    picture: { thumbnail: `https://randomuser.me/api/portraits/${gender}/${index}.jpg` },
  };
}

export function fallbackUsers() {
  const users = [];
  for (let i = 0; i < 50; i++) {
    users.push(generateMockUser(i));
  }
  return users;
}

export async function loadUsers(withMeta = false) {
  const sourceUrl = process.env.RANDOMUSER_API_URL || DEFAULT_API_URL;
  let users = [];
  let fallbackUsed = false;
  let fetchedAt = new Date().toISOString();

  try {
    const response = await fetch(sourceUrl);
    fetchedAt = new Date().toISOString(); // Update timestamp after fetch attempt

    if (!response.ok) {
      throw new Error(`HTTP error! Status: ${response.status}`);
    }

    const data = await response.json();
    if (!data || !Array.isArray(data.results)) {
      throw new Error('Invalid data structure received from API.');
    }

    users = data.results.map(user => ({
      id: { value: user.id && user.id.value ? user.id.value : user.login.uuid },
      name: { first: user.name.first, last: user.name.last },
      email: user.email,
      phone: user.phone,
      location: { country: user.location.country, city: user.location.city },
      registered: { date: user.registered.date },
      picture: { thumbnail: user.picture.thumbnail },
    }));

  } catch (error) {
    fallbackUsed = true;
    users = fallbackUsers();
  }

  if (withMeta) {
    return { users, fallbackUsed, sourceUrl, fetchedAt };
  }
  return users;
}

export function buildMetrics(users) {
  const totalUsers = users.length;
  const genderCounts = users.reduce((acc, user) => {
    // Assuming 'gender' is implicitly available in the full API response,
    // though not strictly in the *required output structure*.
    // For metrics, we might need a richer user object or infer it.
    // Given the target structure {name: {first,last}, ...}, gender isn't directly exposed.
    // If the original API object was passed, it would have gender.
    // For now, let's assume `name.first` can be used to roughly infer or just skip gender.
    // The prompt only says 'User object structure: {id: {value}, name: {first, last}, ...}'
    // Let's create metrics that only rely on the *provided* structure.

    // Using first name for a very basic "gender" inference for mock/fallback data,
    // otherwise, this metric would be unreliable without actual gender field.
    // For production, the 'gender' field from the original API response (before mapping)
    // would be ideal for this metric.
    // Sticking to required output, we can't get actual gender easily.
    // So, let's focus on other fields like location and registration.

    return acc;
  }, { male: 0, female: 0 });


  const uniqueCountries = new Set();
  const uniqueCities = new Set();
  let totalRegistrationYears = 0;
  let validRegistrationsCount = 0;

  users.forEach(user => {
    if (user.location && user.location.country) {
      uniqueCountries.add(user.location.country);
    }
    if (user.location && user.location.city) {
      uniqueCities.add(user.location.city);
    }
    if (user.registered && user.registered.date) {
      const registrationDate = new Date(user.registered.date);
      if (!isNaN(registrationDate)) {
        totalRegistrationYears += (new Date().getFullYear() - registrationDate.getFullYear());
        validRegistrationsCount++;
      }
    }
  });

  const avgRegistrationYears = validRegistrationsCount > 0 ?
    (totalRegistrationYears / validRegistrationsCount) : 0;

  return {
    totalUsers,
    uniqueCountries: uniqueCountries.size,
    uniqueCities: uniqueCities.size,
    avgRegistrationYears: parseFloat(avgRegistrationYears.toFixed(2)),
  };
}