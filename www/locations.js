/* ==========================================================================
   locations.js — Pakistan provinces, districts, tehsils and cities (works offline)

   Used by the searchable Province / City / District / Tehsil boxes on the
   admission form. Administrative boundaries change from time to time, so the
   boxes also accept any text you type that is not in this list.
   Each district lists its tehsils; "cities" lists major cities per province.
   ========================================================================== */
'use strict';

const PK_DATA = {
  'Punjab': {
    alias: [],
    districts: {
      'Attock': 'Attock, Fateh Jang, Hassan Abdal, Hazro, Jand, Pindi Gheb',
      'Bahawalnagar': 'Bahawalnagar, Chishtian, Fort Abbas, Haroonabad, Minchinabad',
      'Bahawalpur': 'Ahmadpur East, Bahawalpur City, Bahawalpur Saddar, Hasilpur, Khairpur Tamewali, Yazman',
      'Bhakkar': 'Bhakkar, Darya Khan, Kallur Kot, Mankera',
      'Chakwal': 'Chakwal, Choa Saidan Shah, Kallar Kahar',
      'Chiniot': 'Bhawana, Chiniot, Lalian',
      'Dera Ghazi Khan': 'Dera Ghazi Khan, Kot Chutta',
      'Faisalabad': 'Chak Jhumra, Faisalabad City, Faisalabad Saddar, Jaranwala, Samundri, Tandlianwala',
      'Gujranwala': 'Gujranwala City, Gujranwala Saddar, Kamoke, Nowshera Virkan',
      'Gujrat': 'Gujrat, Kharian, Sarai Alamgir',
      'Hafizabad': 'Hafizabad, Pindi Bhattian',
      'Jhang': 'Ahmedpur Sial, Athara Hazari, Jhang, Shorkot',
      'Jhelum': 'Dina, Jhelum, Pind Dadan Khan, Sohawa',
      'Kasur': 'Chunian, Kasur, Kot Radha Kishan, Pattoki',
      'Khanewal': 'Jahanian, Kabirwala, Khanewal, Mian Channu',
      'Khushab': 'Khushab, Noorpur Thal, Quaidabad',
      'Kot Addu': 'Chowk Sarwar Shaheed, Kot Addu',
      'Lahore': 'Aziz Bhatti, Data Gunj Buksh, Gulberg, Iqbal Town, Lahore Cantt, Nishtar, Raiwind, Samanabad, Shalimar, Wagah',
      'Layyah': 'Chaubara, Karor Lal Esan, Layyah',
      'Lodhran': 'Dunyapur, Kehror Pacca, Lodhran',
      'Mandi Bahauddin': 'Malakwal, Mandi Bahauddin, Phalia',
      'Mianwali': 'Isakhel, Mianwali, Piplan',
      'Multan': 'Jalalpur Pirwala, Multan City, Multan Saddar, Shujabad',
      'Murree': 'Murree',
      'Muzaffargarh': 'Alipur, Jatoi, Muzaffargarh',
      'Nankana Sahib': 'Nankana Sahib, Sangla Hill, Shahkot',
      'Narowal': 'Narowal, Shakargarh, Zafarwal',
      'Okara': 'Depalpur, Okara, Renala Khurd',
      'Pakpattan': 'Arifwala, Pakpattan',
      'Rahim Yar Khan': 'Khanpur, Liaquatpur, Rahim Yar Khan, Sadiqabad',
      'Rajanpur': 'Jampur, Rajanpur, Rojhan',
      'Rawalpindi': 'Gujar Khan, Kahuta, Kallar Syedan, Kotli Sattian, Rawalpindi, Taxila',
      'Sahiwal': 'Chichawatni, Sahiwal',
      'Sargodha': 'Bhalwal, Bhera, Kot Momin, Sahiwal, Sargodha, Shahpur, Silanwali',
      'Sheikhupura': 'Ferozewala, Muridke, Safdarabad, Sharaqpur Sharif, Sheikhupura',
      'Sialkot': 'Daska, Pasrur, Sambrial, Sialkot',
      'Talagang': 'Lawa, Talagang',
      'Taunsa': 'Taunsa',
      'Toba Tek Singh': 'Gojra, Kamalia, Pir Mahal, Toba Tek Singh',
      'Vehari': 'Burewala, Mailsi, Vehari',
      'Wazirabad': 'Alipur Chatha, Wazirabad'
    },
    cities: 'Lahore, Faisalabad, Rawalpindi, Gujranwala, Multan, Sargodha, Sialkot, Bahawalpur, Sheikhupura, Jhang, Gujrat, Kasur, Rahim Yar Khan, Sahiwal, Okara, Wah Cantonment, Dera Ghazi Khan, Mandi Bahauddin, Mianwali, Chiniot, Kamoke, Hafizabad, Sadiqabad, Burewala, Jhelum, Khanewal, Muzaffargarh, Bahawalnagar, Pakpattan, Attock, Vehari, Chakwal, Toba Tek Singh, Khushab, Layyah, Narowal, Lodhran, Gojra, Murree, Taxila, Jaranwala, Muridke, Kharian, Wazirabad, Bhakkar, Kot Addu, Rajanpur, Nankana Sahib, Arifwala, Mian Channu, Hasilpur, Daska, Kamalia, Samundri, Chishtian, Haroonabad, Ahmadpur East'
  },
  'Sindh': {
    alias: [],
    districts: {
      'Badin': 'Badin, Golarchi, Matli, Talhar, Tando Bago',
      'Dadu': 'Dadu, Johi, Khairpur Nathan Shah, Mehar',
      'Ghotki': 'Daharki, Ghotki, Khangarh, Mirpur Mathelo, Ubauro',
      'Hyderabad': 'Hyderabad City, Hyderabad Rural, Latifabad, Qasimabad',
      'Jacobabad': 'Garhi Khairo, Jacobabad, Thul',
      'Jamshoro': 'Jamshoro, Kotri, Manjhand, Sehwan',
      'Karachi Central': 'Gulberg, Liaquatabad, Nazimabad, New Karachi, North Nazimabad',
      'Karachi East': 'Gulshan-e-Iqbal, Jinnah, Safoora',
      'Karachi South': 'Aram Bagh, Civil Lines, Garden, Lyari, Saddar',
      'Karachi West': 'Baldia, Manghopir, Mauripur, Orangi, SITE',
      'Keamari': 'Keamari, Maripur',
      'Korangi': 'Korangi, Landhi, Model Colony, Shah Faisal',
      'Malir': 'Bin Qasim, Gadap, Ibrahim Hyderi, Malir',
      'Kashmore': 'Kandhkot, Kashmore, Tangwani',
      'Khairpur': 'Faiz Ganj, Gambat, Khairpur, Kingri, Kotdiji, Nara, Sobhodero',
      'Larkana': 'Bakrani, Dokri, Larkana, Ratodero',
      'Matiari': 'Hala, Matiari, Saeedabad',
      'Mirpur Khas': 'Digri, Hussain Bux Mari, Jhuddo, Kot Ghulam Muhammad, Mirpur Khas, Sindhri',
      'Naushahro Feroze': 'Bhiria, Kandiaro, Mehrabpur, Moro, Naushahro Feroze',
      'Qambar Shahdadkot': 'Kambar, Miro Khan, Nasirabad, Shahdadkot, Warah',
      'Sanghar': 'Jam Nawaz Ali, Khipro, Sanghar, Shahdadpur, Sinjhoro, Tando Adam',
      'Shaheed Benazirabad': 'Daur, Nawabshah, Qazi Ahmed, Sakrand',
      'Shikarpur': 'Garhi Yasin, Khanpur, Lakhi, Shikarpur',
      'Sujawal': 'Jati, Kharo Chan, Mirpur Bathoro, Shah Bandar, Sujawal',
      'Sukkur': 'New Sukkur, Pano Aqil, Rohri, Salehpat, Sukkur',
      'Tando Allahyar': 'Chamber, Jhando Mari, Tando Allahyar',
      'Tando Muhammad Khan': 'Bulri Shah Karim, Tando Ghulam Hyder, Tando Muhammad Khan',
      'Tharparkar': 'Chachro, Dahli, Diplo, Islamkot, Kaloi, Mithi, Nagarparkar',
      'Thatta': 'Ghorabari, Keti Bandar, Mirpur Sakro, Thatta',
      'Umerkot': 'Kunri, Pithoro, Samaro, Umerkot'
    },
    cities: 'Karachi, Hyderabad, Sukkur, Larkana, Nawabshah, Mirpur Khas, Jacobabad, Shikarpur, Khairpur, Dadu, Thatta, Badin, Tando Adam, Tando Allahyar, Kotri, Umerkot, Ghotki, Mithi, Jamshoro, Sanghar, Daharki, Moro, Kandhkot, Mehar'
  },
  'Khyber Pakhtunkhwa': {
    alias: ['KPK', 'KP', 'NWFP'],
    districts: {
      'Abbottabad': 'Abbottabad, Havelian, Lora',
      'Bajaur': 'Barang, Khar, Mamund, Nawagai, Salarzai, Utmankhel',
      'Bannu': 'Baka Khel, Bannu, Domel, Kakki, Miryan',
      'Battagram': 'Allai, Battagram',
      'Buner': 'Chagharzai, Daggar, Gadezai, Gagra, Khudu Khel, Mandanr',
      'Charsadda': 'Charsadda, Shabqadar, Tangi',
      'Chitral Lower': 'Chitral, Drosh',
      'Chitral Upper': 'Booni, Mastuj',
      'Dera Ismail Khan': 'Daraban, Dera Ismail Khan, Kulachi, Paharpur, Paroa',
      'Hangu': 'Hangu, Tall',
      'Haripur': 'Ghazi, Haripur, Khanpur',
      'Karak': 'Banda Daud Shah, Karak, Takht-e-Nasrati',
      'Khyber': 'Bara, Jamrud, Landi Kotal, Mullagori',
      'Kohat': 'Kohat, Lachi',
      'Kohistan Lower': 'Pattan',
      'Kohistan Upper': 'Dassu',
      'Kolai Palas': 'Palas',
      'Kurram': 'Parachinar, Sadda',
      'Lakki Marwat': 'Lakki Marwat, Serai Naurang',
      'Lower Dir': 'Adenzai, Balambat, Jandool, Lal Qila, Samarbagh, Timergara',
      'Malakand': 'Batkhela, Dargai',
      'Mansehra': 'Balakot, Mansehra, Oghi',
      'Mardan': 'Katlang, Mardan, Takht Bhai',
      'Mohmand': 'Ghalanai, Halimzai, Pandiali, Safi',
      'North Waziristan': 'Datta Khel, Mir Ali, Miranshah',
      'Nowshera': 'Jehangira, Nowshera, Pabbi',
      'Orakzai': 'Lower Orakzai, Upper Orakzai',
      'Peshawar': 'Mathra, Peshawar Cantonment, Peshawar City, Shah Alam',
      'Shangla': 'Alpuri, Chakesar, Puran',
      'South Waziristan Lower': 'Wana',
      'South Waziristan Upper': 'Ladha',
      'Swabi': 'Lahor, Razar, Swabi, Topi',
      'Swat': 'Babuzai, Bahrain, Barikot, Charbagh, Kabal, Khwazakhela, Matta',
      'Tank': 'Jandola, Tank',
      'Torghar': 'Judba',
      'Upper Dir': 'Dir, Wari'
    },
    cities: 'Peshawar, Mardan, Mingora, Abbottabad, Kohat, Dera Ismail Khan, Bannu, Swabi, Nowshera, Charsadda, Mansehra, Haripur, Chitral, Dir, Hangu, Karak, Parachinar, Timergara, Batkhela, Dargai, Tank, Lakki Marwat, Battagram, Khar'
  },
  'Balochistan': {
    alias: [],
    districts: {
      'Awaran': 'Awaran, Jhal Jhao, Mashkai',
      'Barkhan': 'Barkhan',
      'Chagai': 'Dalbandin, Nokkundi, Taftan, Yakmach',
      'Chaman': 'Chaman',
      'Dera Bugti': 'Dera Bugti, Sui',
      'Duki': 'Duki',
      'Gwadar': 'Gwadar, Jiwani, Ormara, Pasni, Suntsar',
      'Harnai': 'Harnai',
      'Hub': 'Hub',
      'Jaffarabad': 'Dera Allahyar, Gandakha, Jhat Pat, Usta Muhammad',
      'Jhal Magsi': 'Gandawa, Jhal Magsi',
      'Kachhi': 'Dhadar, Mach, Sanni',
      'Kalat': 'Kalat, Mangochar, Surab',
      'Kech': 'Buleda, Dasht, Hoshab, Turbat, Tump',
      'Kharan': 'Gwash, Kharan',
      'Khuzdar': 'Karkh, Khuzdar, Nal, Wadh, Zehri',
      'Killa Abdullah': 'Gulistan, Killa Abdullah',
      'Killa Saifullah': 'Killa Saifullah, Muslim Bagh',
      'Kohlu': 'Kahan, Kohlu',
      'Lasbela': 'Bela, Lakhra, Uthal',
      'Loralai': 'Loralai',
      'Mastung': 'Mastung',
      'Musakhel': 'Musakhel',
      'Nasirabad': 'Dera Murad Jamali, Tamboo',
      'Nushki': 'Nushki',
      'Panjgur': 'Gichk, Panjgur, Parom',
      'Pishin': 'Barshore, Hurramzai, Pishin',
      'Quetta': 'Panjpai, Quetta City, Quetta Saddar, Zarghoon',
      'Sherani': 'Sherani',
      'Sibi': 'Lehri, Sibi',
      'Sohbatpur': 'Sohbatpur',
      'Surab': 'Surab',
      'Washuk': 'Besima, Washuk',
      'Zhob': 'Sambaza, Zhob',
      'Ziarat': 'Ziarat'
    },
    cities: 'Quetta, Gwadar, Turbat, Khuzdar, Chaman, Zhob, Sibi, Loralai, Hub, Dera Murad Jamali, Kalat, Pishin, Mastung, Nushki, Panjgur, Usta Muhammad, Dera Allahyar, Kharan, Kohlu, Ziarat, Bela, Uthal, Muslim Bagh'
  },
  'Gilgit-Baltistan': {
    alias: ['GB', 'Gilgit Baltistan'],
    districts: {
      'Astore': 'Astore, Rama',
      'Darel': 'Darel',
      'Diamer': 'Chilas, Thak',
      'Ghanche': 'Chorbat, Daghoni, Khaplu',
      'Ghizer': 'Gahkuch, Ishkoman, Punial',
      'Gilgit': 'Danyore, Gilgit',
      'Gupis-Yasin': 'Gupis, Yasin',
      'Hunza': 'Aliabad, Gojal',
      'Kharmang': 'Kharmang, Tolti',
      'Nagar': 'Nagar',
      'Roundu': 'Roundu',
      'Shigar': 'Shigar',
      'Skardu': 'Skardu',
      'Tangir': 'Tangir'
    },
    cities: 'Gilgit, Skardu, Chilas, Karimabad, Khaplu, Gahkuch, Aliabad, Astore'
  },
  'Azad Jammu & Kashmir': {
    alias: ['AJK', 'Azad Kashmir', 'Azad Jammu and Kashmir'],
    districts: {
      'Bagh': 'Bagh, Dhirkot, Harighel',
      'Bhimber': 'Barnala, Bhimber, Samahni',
      'Haveli': 'Forward Kahuta, Haveli',
      'Jhelum Valley': 'Chikar, Hattian Bala, Leepa',
      'Kotli': 'Charhoi, Fatehpur Thakyala, Khuiratta, Kotli, Nakyal, Sehnsa',
      'Mirpur': 'Chakswari, Dadyal, Mirpur',
      'Muzaffarabad': 'Muzaffarabad, Naseerabad, Patika',
      'Neelum': 'Athmuqam, Sharda',
      'Poonch': 'Abbaspur, Hajira, Rawalakot, Thorar',
      'Sudhnoti': 'Baloch, Mang, Pallandri, Trarkhal'
    },
    cities: 'Muzaffarabad, Mirpur, Kotli, Rawalakot, Bagh, Bhimber, Dadyal, Pallandri, Hattian Bala'
  },
  'Islamabad Capital Territory': {
    alias: ['ICT', 'Islamabad'],
    districts: { 'Islamabad': 'Islamabad Rural, Islamabad Urban' },
    cities: 'Islamabad'
  }
};

/* Flat lists built once, for searching across everything */
const PK = (() => {
  const split = text => String(text).split(',').map(x => x.trim()).filter(Boolean);
  const provinces = [], districts = [], tehsils = [], cities = [];
  for (const [province, p] of Object.entries(PK_DATA)) {
    provinces.push({ name: province, alias: p.alias });
    for (const [district, list] of Object.entries(p.districts)) {
      districts.push({ name: district, province });
      for (const t of split(list)) tehsils.push({ name: t, district, province });
    }
    for (const c of split(p.cities)) cities.push({ name: c, province });
  }
  return { provinces, districts, tehsils, cities };
})();

/**
 * Type-ahead match. Returns a score (lower is better) or -1 for no match.
 * One letter matches only the start of a name ("M" gives Multan, Muzaffargarh, Mianwali...);
 * longer text can also match the start of a later word, or anywhere inside the name.
 */
function pkScore(query, names) {
  const q = String(query || '').trim().toLowerCase();
  if (!q) return 0;
  let best = -1;
  for (const raw of names) {
    const n = String(raw).toLowerCase();
    let sc = -1;
    if (n.startsWith(q)) sc = 0;
    else if (q.length >= 2 && n.split(/[\s\-&]+/).some(w => w.startsWith(q))) sc = 1;
    else if (q.length >= 3 && n.includes(q)) sc = 2;
    if (sc >= 0 && (best < 0 || sc < best)) best = sc;
  }
  return best;
}
