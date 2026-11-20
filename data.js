// ============================================================
//  Edit this file to customise the portfolio.
//  Images can be URLs or local files in "assets/" (e.g. 'assets/project.png').
// ============================================================

const IMG = 'https://ahmedbourazza.github.io/assets/imgs/';

export const profile = {
  name: 'Ahmed Bourazza',
  shortName: 'Ahmed',
  role: 'Software Engineer · AI & Full Stack',
  photo: 'assets/ahmed.jpg',
  status: 'Available now for a full-time role anywhere in France',
  intro:
    'Software engineer and top of my class, selected for a double engineering degree at ENSIM (France). ' +
    'I build production software end to end, from gathering requirements with end users to design, development, testing and documentation, ' +
    'and I bring AI into that work: machine learning and computer vision projects, and AI-assisted development with GitHub Copilot and Claude Code. ' +
    'I have shipped tools used every day at VINCI Energies, OCP and Amorino, and at the IT consultancy ALTEN.',
  // 6 sticky notes on the 3D board
  boardSkills: ['Python ML', 'Deep Learning', 'Computer Vision', 'C#/.NET', 'Java Spring', 'Angular React'],
  // Full list shown in the "About me" panel
  skills: [
    'Python', 'Machine Learning', 'Deep Learning', 'TensorFlow', 'Scikit-learn', 'OpenCV', 'YOLOv8',
    'Pandas', 'Power BI', 'GitHub Copilot', 'Claude Code', 'C#', '.NET Core', 'Java', 'Spring Boot',
    'Angular', 'React', 'SQL Server', 'Azure', 'Docker', 'CI/CD',
  ],
  experience: [
    {
      date: '2026',
      title: 'Analyst Developer (6-month internship)',
      company: 'VINCI Energies SI · France',
      mission:
        'Designed and built version 2 of CS Bag, the project management tool of VINCI Energies SI. ' +
        'Built automation and data backup scripts, and fixed issues reported in group applications.',
    },
    {
      date: '2025',
      title: 'Software Development Engineer (10-month contract)',
      company: 'Amorino · France',
      mission:
        'Designed and built a stock management module for the Amorino shop, replacing a costly existing tool.',
    },
    {
      date: '2024',
      title: 'Software Development Engineer (6-month internship)',
      company: 'OCP · Morocco',
      mission:
        'Co-designed and built a responsive app that digitises fire safety equipment inspections, replacing paper and Excel.',
    },
    {
      date: '2023',
      title: 'Software Development Engineer (6-month internship)',
      company: 'ALTEN · Morocco',
      mission:
        'Designed and built an incident management system (reporting, tracking and resolution) with spaces for consultants and beneficiaries.',
    },
  ],
  education: [
    { date: '2024 – 2026', title: 'Engineering degree, Computer Science', school: 'ENSIM, Le Mans' },
    { date: '2020 – 2024', title: 'Preparatory and engineering cycle', school: 'ENSA Fès' },
  ],
  cv: 'https://ahmedbourazza.github.io/CV-Ahmed-Bourazza.pdf',
  email: 'ahmed.bourazza.pro@gmail.com',
  phone: '+33 7 51 56 87 31',
  // Contact form: messages are forwarded to your inbox by FormSubmit (formsubmit.co).
  // After the activation email, you can replace the address below with the random
  // alias FormSubmit gives you, so your email isn't visible in the code.
  contactForm: 'https://formsubmit.co/ajax/ahmed.bourazza.pro@gmail.com',
  // Visitor counter: your GoatCounter code (the "xxx" in xxx.goatcounter.com).
  // Leave empty to hide the counter.
  goatcounter: 'ahmedbourazza',
  socials: {
    github: 'https://github.com/Ahmedbourazza',
    linkedin: 'https://www.linkedin.com/in/ahmed-bourazza-06618b244/',
    instagram: 'https://www.instagram.com/ah_m_ed1b/',
  },
};

// Up to 8 projects are shown on the wall (4 columns x 2 rows)
export const projects = [
  {
    title: 'Abandoned Object Detection',
    type: 'AI · Computer vision',
    description:
      'Video analysis system that detects abandoned objects and recognises when they are recovered, combining object detection, template matching and multi-object tracking.',
    tech: ['Python', 'Django', 'OpenCV', 'YOLOv8', 'Template Matching', 'DeepSORT'],
    color: '#22d3ee',
    image: IMG + 'objectDetection.png',
    link: 'https://www.linkedin.com/posts/ahmed-bourazza-06618b244_its-always-exciting-to-bring-ai-into-real-world-activity-7373303229734109184-1IeV',
    code: null,
  },
  {
    title: 'Hand Sign & Face Recognition',
    type: 'AI · Machine learning',
    description: 'Website that recognises hand signs and faces with machine learning models served through Flask.',
    tech: ['Python', 'Flask', 'Machine Learning'],
    color: '#ec4899',
    image: IMG + 'fr.png',
    link: null,
    code: null,
  },
  {
    title: 'Fire Control System',
    type: 'Web app · OCP',
    description:
      'Responsive app that digitises fire safety equipment inspections (pumps, extinguishers) at OCP Jorf Lasfar, replacing paper and Excel.',
    tech: ['Spring Boot', 'Spring Security', 'Spring Session', 'MySQL'],
    color: '#f97316',
    image: IMG + 'fireControl.png',
    link: 'https://www.linkedin.com/posts/ahmed-bourazza-06618b244_ocp-stage-innovation-activity-7236283786089361409-plXN',
    code: null,
  },
  {
    title: 'FlaShop',
    type: 'E-commerce',
    description: 'E-commerce application with separate customer, owner and administrator spaces.',
    tech: ['ASP.NET', 'Bootstrap', 'MySQL', 'JavaScript'],
    color: '#a78bfa',
    image: IMG + 'ecom.png',
    link: 'https://www.linkedin.com/posts/ahmed-bourazza-06618b244_flashop-ecommerce-aspnetcore-activity-7147713403321552897-j3l2',
    code: null,
  },
  {
    title: 'Incident Management',
    type: 'Web app · ALTEN',
    description:
      'Incident management system for reporting, tracking and resolving issues, with dedicated spaces for consultants and beneficiaries.',
    tech: ['MERISE', 'PHP', 'MySQL'],
    color: '#3b82f6',
    image: IMG + 'gali.png',
    link: 'https://www.linkedin.com/posts/ahmed-bourazza-06618b244_alten-webdevelopment-activity-7131377487703351297-IE_O',
    code: null,
  },
  {
    title: 'ShapesWar',
    type: '2D game',
    description: 'Minimalist 2D action game where the player controls a cube in battle.',
    tech: ['Unity'],
    color: '#fbbf24',
    image: IMG + "Capture%20d'%C3%A9cran%202024-06-11%20111507.png",
    link: null,
    code: null,
  },
  {
    title: 'Library Management',
    type: 'Desktop app',
    description: 'Desktop library management application.',
    tech: ['Windows Forms', 'MySQL'],
    color: '#10b981',
    image: IMG + 'library.png',
    link: 'https://www.linkedin.com/posts/ahmed-bourazza-06618b244_librarymanagementsystem-techinnovation-cshforms-activity-7136409529981792258-taU-',
    code: null,
  },
  {
    title: 'Library System',
    type: 'Web app · Spring',
    description: 'Library management system built with Spring and a MongoDB database.',
    tech: ['Spring', 'MongoDB'],
    color: '#6366f1',
    image: IMG + 'librarySpring.png',
    link: null,
    code: null,
  },
];
