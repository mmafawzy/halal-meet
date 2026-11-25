/** Realistic seed data: names, cities and languages per country. */

export const MALE_NAMES = [
  'Ahmed', 'Mohamed', 'Mahmoud', 'Omar', 'Ali', 'Youssef', 'Khaled', 'Hassan', 'Amr', 'Tarek',
  'Karim', 'Mostafa', 'Islam', 'Ibrahim', 'Hussein', 'Abdullah', 'Faisal', 'Salem', 'Rashed', 'Majid',
  'Sultan', 'Nasser', 'Bilal', 'Zaid', 'Hamza', 'Anas', 'Yahya', 'Idris', 'Mehmet', 'Yusuf',
  'Emre', 'Burak', 'Can', 'Kerem', 'Osman', 'Selim', 'Hakan', 'Furqan', 'Arslan', 'Asim',
  'Imran', 'Bilawal', 'Fahad', 'Usman', 'Zeeshan', 'Haroon', 'Danish', 'Naveed', 'Adeel', 'Rizwan',
  'Sami', 'Adnan', 'Ayman', 'Wael', 'Marwan', 'Rami', 'Fadi', 'Nizar', 'Hadi', 'Sufyan',
  'Anwar', 'Jamal', 'Rashid', 'Suleiman', 'Ismail', 'Ayoub', 'Yassin', 'Nabeel', 'Murad', 'Talha',
];

export const FEMALE_NAMES = [
  'Sara', 'Fatima', 'Aisha', 'Mariam', 'Nour', 'Hana', 'Yasmin', 'Laila', 'Dina', 'Rana',
  'Salma', 'Farah', 'Aya', 'Heba', 'Mona', 'Rania', 'Basma', 'Nada', 'Alia', 'Zainab',
  'Khadija', 'Amina', 'Hafsa', 'Sumaya', 'Ruqayya', 'Safa', 'Iman', 'Amani', 'Bushra', 'Jana',
  'Elif', 'Zeynep', 'Ayşe', 'Merve', 'Esra', 'Selin', 'Büşra', 'Hatice', 'Kübra', 'Melike',
  'Ayesha', 'Sana', 'Hina', 'Rabia', 'Zara', 'Nadia', 'Sadia', 'Iqra', 'Mehwish', 'Shazia',
  'Rim', 'Wafa', 'Souad', 'Nawal', 'Latifa', 'Ghada', 'Hala', 'Lubna', 'Rasha', 'Dalia',
  'Malak', 'Reem', 'Layan', 'Shatha', 'Anoud', 'Jood', 'Tala', 'Razan', 'Sanad', 'Mais',
];

export const CITIES: Record<string, string[]> = {
  EG: ['Cairo', 'Nasr City', 'Alexandria', 'Giza', 'New Cairo', 'Mansoura', 'Tanta', 'Aswan', 'Port Said', 'Heliopolis'],
  JO: ['Amman', 'Zarqa', 'Irbid', 'Aqaba', 'Salt'],
  SA: ['Riyadh', 'Jeddah', 'Makkah', 'Medina', 'Dammam', 'Khobar', 'Abha'],
  AE: ['Dubai', 'Abu Dhabi', 'Sharjah', 'Ajman', 'Al Ain', 'Ras Al Khaimah'],
  QA: ['Doha', 'Al Rayyan', 'Al Wakrah'],
  KW: ['Kuwait City', 'Hawalli', 'Salmiya', 'Al Ahmadi', 'Jahra'],
  BH: ['Manama', 'Riffa', 'Muharraq', 'Isa Town'],
  OM: ['Muscat', 'Salalah', 'Sohar', 'Nizwa'],
  MA: ['Casablanca', 'Rabat', 'Marrakech', 'Fes', 'Tangier', 'Agadir', 'Meknes'],
  DZ: ['Algiers', 'Oran', 'Constantine', 'Annaba', 'Setif'],
  TN: ['Tunis', 'Sfax', 'Sousse', 'Bizerte', 'Kairouan'],
  GB: ['London', 'Birmingham', 'Manchester', 'Leeds', 'Glasgow', 'Bradford', 'Leicester', 'Luton', 'Bristol'],
  IE: ['Dublin', 'Cork', 'Limerick', 'Galway'],
  DE: ['Berlin', 'Hamburg', 'Munich', 'Frankfurt', 'Cologne', 'Stuttgart', 'Duisburg'],
  FR: ['Paris', 'Marseille', 'Lyon', 'Lille', 'Toulouse', 'Strasbourg', 'Nice'],
  NL: ['Amsterdam', 'Rotterdam', 'The Hague', 'Utrecht', 'Eindhoven'],
  BE: ['Brussels', 'Antwerp', 'Ghent', 'Liege', 'Charleroi'],
  US: ['New York', 'Chicago', 'Houston', 'Detroit', 'Los Angeles', 'Dallas', 'Jersey City', 'Dearborn', 'Atlanta'],
  CA: ['Toronto', 'Montreal', 'Vancouver', 'Calgary', 'Ottawa', 'Mississauga'],
};

/** Languages available per country (first entry is the local language). */
export const LANGUAGES: Record<string, string[]> = {
  EG: ['ar', 'en', 'fr'],
  JO: ['ar', 'en'],
  SA: ['ar', 'en'],
  AE: ['ar', 'en', 'ur', 'hi'],
  QA: ['ar', 'en'],
  KW: ['ar', 'en'],
  BH: ['ar', 'en'],
  OM: ['ar', 'en', 'ur'],
  MA: ['ar', 'fr', 'en', 'berber'],
  DZ: ['ar', 'fr', 'berber'],
  TN: ['ar', 'fr', 'en'],
  GB: ['en', 'ar', 'ur', 'bn'],
  IE: ['en', 'ar'],
  DE: ['de', 'ar', 'tr', 'en'],
  FR: ['fr', 'ar', 'en'],
  NL: ['nl', 'en', 'ar'],
  BE: ['nl', 'fr', 'ar', 'en'],
  US: ['en', 'ar', 'ur'],
  CA: ['en', 'fr', 'ar'],
};

export const EDUCATION_LEVELS = ['high_school', 'bachelor', 'master', 'phd', 'diploma'];

export const PROFESSIONS = [
  'Software engineer', 'Doctor', 'Pharmacist', 'Nurse', 'Teacher', 'Accountant', 'Civil engineer',
  'Architect', 'Dentist', 'Business analyst', 'Marketing manager', 'Data scientist', 'Lawyer',
  'Graphic designer', 'Project manager', 'Entrepreneur', 'Financial analyst', 'Lab technician',
  'University lecturer', 'Sales manager', 'HR specialist', 'Physiotherapist', 'Translator',
];

/** Country weights for the seed (sums to 100). */
export const COUNTRY_WEIGHTS: Record<string, number> = {
  EG: 18, SA: 12, AE: 10, GB: 10, US: 10, DE: 7, FR: 7, MA: 7,
  JO: 3, QA: 3, KW: 3, BH: 2, OM: 2, DZ: 3, TN: 3, IE: 1, NL: 2, BE: 2, CA: 4,
};

/** Countries seeded as 'open' (density override; real status needs ≥2000 verified profiles). */
export const SEEDED_OPEN_COUNTRIES = ['EG', 'SA', 'AE', 'GB', 'US'];
