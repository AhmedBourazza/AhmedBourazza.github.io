// ============================================================
//  Edit this file to customise the portfolio.
//  Images can be URLs or local files in "assets/" (e.g. 'assets/project.png').
// ============================================================

const IMG = 'https://ahmedbourazza.github.io/assets/imgs/';

export const profile = {
  name: 'Ahmed Bourazza',
  shortName: 'Ahmed',
  role: 'Full-Stack .NET & Cloud Engineer',
  photo: 'assets/ahmed.jpg',
  status: 'Looking for a full-time role, available immediately and open to any location in France',
  intro:
    'Software engineer used to delivering business applications end to end, from the first requirements to production. ' +
    'I gained my full-stack and cloud experience at large groups (VINCI Energies, OCP, Amorino) and at the IT consultancy ALTEN.',
  // 6 sticky notes on the 3D board
  boardSkills: ['C#/.NET', 'Angular React', 'Azure Cloud', 'SQL Server', 'DevOps CI/CD', 'Python AI'],
  // Full list shown in the "About me" panel
  skills: [
    'C#', 'ASP.NET Core', 'Entity Framework Core', 'TypeScript', 'Angular', 'React', 'Java', 'Python',
    'SQL Server', 'PostgreSQL', 'MongoDB', 'Azure', 'Azure DevOps', 'GitHub Actions', 'Docker',
    'SonarQube', 'Checkmarx', 'xUnit', 'Figma', 'Scrum', 'GitHub Copilot', 'Claude Code',
  ],
  // Missions are listed without the tech stack on purpose
  experience: [
    {
      date: '2026',
      title: 'Analyst Developer · 6 months',
      company: 'VINCI Energies SI · Le Mans, France · Mar – Sep 2026',
      missions: [
        'Designed and built CS Bag v2, a web application for tracking projects at VINCI Energies SI.',
        'Structured the data model and cleaned up the database, removing more than 150,000 duplicates.',
        'Set up scheduled email alerts and redesigned screens from design mockups.',
        'Code quality and security checks, testing and cloud deployments within an Agile team.',
      ],
    },
    {
      date: '2025',
      title: 'Versatile Manager · 10 months',
      company: 'Amorino · Le Mans, France · Jan – Oct 2025',
      missions: [
        'Created calculation tools to make day-to-day calculations easier.',
        "Managed staff and tracked the shop's supplies.",
        'Coordinated with the team and took part in the daily organisation of the shop.',
      ],
      softSkills: ['Communication', 'Organization', 'Team coordination'],
    },
    {
      date: '2024',
      title: 'Full-Stack Developer · 6 months',
      company: 'OCP · El Jadida, Morocco · Mar – Sep 2024',
      missions: [
        'Built from scratch an application that lets firefighters inspect safety equipment on tablet and web instead of paper forms.',
        'Gathered requirements directly in the field, then designed the database and a layered back end.',
        'Implemented authentication, three permission levels and dashboards, followed by testing and onboarding the teams.',
      ],
    },
    {
      date: '2023',
      title: 'Full-Stack Developer · 6 months',
      company: 'ALTEN · Fès, Morocco · Mar – Sep 2023',
      missions: [
        'Developed an incident tracking tool that makes it easier for consultants to report blockers and share solutions.',
        'Modelled the data and built two interfaces (requesters and administrators), with code quality and security checks.',
      ],
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

// Projects are laid out on the wall in 2 rows; the columns adapt to how many there are
export const projects = [
  {
    title: 'Abandoned Object Detection',
    type: 'AI · Computer vision · 2024',
    description:
      'Automatically spots bags and objects left unattended using computer vision, with a web interface to follow the alerts.',
    tech: ['Python', 'Django', 'OpenCV', 'YOLOv8', 'DeepSORT'],
    color: '#22d3ee',
    image: IMG + 'objectDetection.png',
    link: 'https://www.linkedin.com/posts/ahmed-bourazza-06618b244_its-always-exciting-to-bring-ai-into-real-world-activity-7373303229734109184-1IeV',
    code: 'https://github.com/Ahmedbourazza/object-detection',
  },
  {
    title: 'Recipe Finder',
    type: 'Web app · 2025',
    description:
      'Recipe search engine by ingredients, connected to TheMealDB API, packaged with Docker and shipped through a CI/CD pipeline.',
    tech: ['Java 17', 'Spring Boot', 'MySQL', 'Docker', 'GitHub Actions'],
    color: '#84cc16',
    image: null,
    link: null,
    code: 'https://github.com/Ahmedbourazza/Recipes-project',
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
      'Lets firefighters at OCP inspect safety equipment (pumps, extinguishers) on tablet and web instead of paper forms, with three permission levels and dashboards.',
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
