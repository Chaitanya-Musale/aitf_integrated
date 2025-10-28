"""Enhanced template management with improved HTML and accessibility"""

# Enhanced HTML Template with dark mode, accessibility, and print support
HTML_TEMPLATE = """
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Selection Sheet - {{ name }}</title>
    <style>
        /* CSS Variables for theming */
        :root {
            --bg-primary: #ffffff;
            --bg-secondary: #f5f5f5;
            --bg-tertiary: #f8f9fa;
            --text-primary: #212529;
            --text-secondary: #6c757d;
            --accent-primary: #667eea;
            --accent-secondary: #764ba2;
            --border-color: #dee2e6;
            --success-color: #4CAF50;
            --warning-color: #FF9800;
            --danger-color: #f44336;
            --info-color: #2196F3;
        }
        
        /* Dark mode support */
        @media (prefers-color-scheme: dark) {
            :root {
                --bg-primary: #1a1a1a;
                --bg-secondary: #2d2d2d;
                --bg-tertiary: #3a3a3a;
                --text-primary: #e0e0e0;
                --text-secondary: #a0a0a0;
                --accent-primary: #8b9df1;
                --accent-secondary: #9d6fb8;
                --border-color: #4a4a4a;
            }
        }
        
        /* Manual dark mode toggle */
        [data-theme="dark"] {
            --bg-primary: #1a1a1a;
            --bg-secondary: #2d2d2d;
            --bg-tertiary: #3a3a3a;
            --text-primary: #e0e0e0;
            --text-secondary: #a0a0a0;
            --accent-primary: #8b9df1;
            --accent-secondary: #9d6fb8;
            --border-color: #4a4a4a;
        }
        
        /* Base styles */
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body { 
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
            max-width: 1200px; 
            margin: 0 auto; 
            padding: 20px;
            background: var(--bg-secondary);
            color: var(--text-primary);
            line-height: 1.6;
            transition: all 0.3s ease;
        }
        
        /* Theme toggle button */
        .theme-toggle {
            position: fixed;
            top: 20px;
            right: 20px;
            background: var(--accent-primary);
            color: white;
            border: none;
            border-radius: 50%;
            width: 50px;
            height: 50px;
            cursor: pointer;
            font-size: 20px;
            z-index: 1000;
            transition: transform 0.3s ease;
            box-shadow: 0 2px 10px rgba(0,0,0,0.2);
        }
        
        .theme-toggle:hover {
            transform: scale(1.1);
        }
        
        .theme-toggle:focus {
            outline: 3px solid var(--accent-secondary);
            outline-offset: 2px;
        }
        
        /* Container */
        .container {
            background: var(--bg-primary);
            border-radius: 12px;
            padding: 30px;
            box-shadow: 0 4px 20px rgba(0,0,0,0.1);
        }
        
        /* Header section */
        .header { 
            background: linear-gradient(135deg, var(--accent-primary) 0%, var(--accent-secondary) 100%);
            color: white; 
            padding: 40px; 
            border-radius: 12px;
            margin-bottom: 30px;
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: -50%;
            right: -50%;
            width: 200%;
            height: 200%;
            background: radial-gradient(circle, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: pulse 4s ease-in-out infinite;
        }
        
        @keyframes pulse {
            0%, 100% { transform: scale(1); opacity: 0.5; }
            50% { transform: scale(1.1); opacity: 0.8; }
        }
        
        .header h1 { 
            margin: 0 0 10px 0; 
            font-size: 2rem;
            position: relative;
            z-index: 1;
        }
        
        .header p {
            opacity: 0.95;
            font-size: 1.1rem;
            position: relative;
            z-index: 1;
        }
        
        /* Score display */
        .score-container {
            margin-top: 20px;
            position: relative;
            z-index: 1;
        }
        
        .score { 
            font-size: 2rem; 
            font-weight: bold;
            display: inline-block;
            padding: 10px 20px;
            border-radius: 8px;
            background: rgba(255, 255, 255, 0.2);
            backdrop-filter: blur(10px);
        }
        
        .score-high { color: var(--success-color); }
        .score-medium { color: var(--warning-color); }
        .score-low { color: var(--danger-color); }
        
        /* Confidence meter */
        .confidence-meter {
            margin-top: 15px;
            padding: 10px;
            background: rgba(255, 255, 255, 0.1);
            border-radius: 8px;
        }
        
        .confidence-bar {
            height: 10px;
            background: rgba(255, 255, 255, 0.3);
            border-radius: 5px;
            overflow: hidden;
        }
        
        .confidence-fill {
            height: 100%;
            background: linear-gradient(90deg, var(--danger-color), var(--warning-color), var(--success-color));
            transition: width 1s ease;
        }
        
        /* Sections */
        .section { 
            margin: 30px 0; 
            padding: 25px; 
            border-left: 4px solid var(--accent-primary);
            background: var(--bg-tertiary);
            border-radius: 8px;
            transition: transform 0.3s ease, box-shadow 0.3s ease;
        }
        
        .section:hover {
            transform: translateX(5px);
            box-shadow: 0 4px 15px rgba(102, 126, 234, 0.1);
        }
        
        .section h2 { 
            color: var(--text-primary);
            margin: 0 0 20px 0;
            display: flex;
            align-items: center;
            gap: 10px;
        }
        
        /* Skip to content link for accessibility */
        .skip-link {
            position: absolute;
            top: -40px;
            left: 0;
            background: var(--accent-primary);
            color: white;
            padding: 8px;
            text-decoration: none;
            border-radius: 0 0 4px 0;
        }
        
        .skip-link:focus {
            top: 0;
        }
        
        /* Info grid */
        .info-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
            gap: 20px;
            margin: 20px 0;
        }
        
        .info-item {
            padding: 15px;
            background: var(--bg-primary);
            border-radius: 8px;
            border: 1px solid var(--border-color);
            transition: transform 0.2s ease;
        }
        
        .info-item:hover {
            transform: translateY(-2px);
            box-shadow: 0 4px 10px rgba(0,0,0,0.1);
        }
        
        .info-label {
            font-weight: 600;
            color: var(--text-secondary);
            font-size: 0.875rem;
            text-transform: uppercase;
            margin-bottom: 8px;
            letter-spacing: 0.5px;
        }
        
        /* Links with auto-formatting */
        .social-links {
            display: flex;
            gap: 15px;
            margin-top: 15px;
        }
        
        .social-links a {
            color: var(--accent-primary);
            text-decoration: none;
            padding: 8px 12px;
            border: 1px solid var(--accent-primary);
            border-radius: 6px;
            transition: all 0.3s ease;
            display: inline-flex;
            align-items: center;
            gap: 5px;
        }
        
        .social-links a:hover {
            background: var(--accent-primary);
            color: white;
        }
        
        /* Skills display */
        .skill-container {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            margin-top: 10px;
        }
        
        .skill { 
            display: inline-block; 
            padding: 6px 12px; 
            background: linear-gradient(135deg, #e8f5e9, #c8e6c9);
            border-radius: 20px; 
            font-size: 0.875rem;
            color: #2e7d32;
            transition: transform 0.2s ease;
        }
        
        .skill:hover {
            transform: scale(1.05);
        }
        
        .skill-matched {
            background: linear-gradient(135deg, #e3f2fd, #bbdefb);
            color: #1565c0;
        }
        
        .skill-related {
            background: linear-gradient(135deg, #fce4ec, #f8bbd0);
            color: #c2185b;
        }
        
        /* Red flags */
        .red-flag { 
            background: #ffebee; 
            border-left: 4px solid var(--danger-color);
            padding: 15px; 
            margin: 15px 0; 
            border-radius: 8px;
            position: relative;
            color: #c62828;
        }
        
        .red-flag strong {
            color: #b71c1c;
        }
        
        .red-flag .evidence {
            font-size: 0.875rem;
            color: #d32f2f;
            font-style: italic;
            margin-top: 5px;
        }
        
        /* Interview questions */
        .question { 
            background: linear-gradient(135deg, #e3f2fd, #f3f7fd);
            padding: 20px; 
            margin: 20px 0; 
            border-radius: 8px;
            border-left: 4px solid var(--info-color);
            position: relative;
            color: var(--text-primary);
        }
        
        .question-category {
            position: absolute;
            top: 10px;
            right: 10px;
            background: var(--info-color);
            color: white;
            padding: 4px 8px;
            border-radius: 4px;
            font-size: 0.75rem;
            text-transform: uppercase;
        }
        
        .question strong {
            color: #1565c0;
        }
        
        /* Rubric scores */
        .rubric-container {
            margin: 20px 0;
        }
        
        .rubric-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 10px;
            margin: 10px 0;
            background: var(--bg-primary);
            border-radius: 6px;
            border: 1px solid var(--border-color);
        }
        
        .rubric-score {
            display: flex;
            gap: 5px;
        }
        
        .score-dot {
            width: 20px;
            height: 20px;
            border-radius: 50%;
            background: var(--border-color);
        }
        
        .score-dot.filled {
            background: var(--accent-primary);
        }
        
        /* Tenure chart */
        .tenure-chart {
            display: flex;
            gap: 10px;
            margin: 20px 0;
            padding: 15px;
            background: var(--bg-primary);
            border-radius: 8px;
            overflow-x: auto;
        }
        
        .tenure-bar {
            min-width: 80px;
            text-align: center;
        }
        
        .tenure-bar-fill {
            background: linear-gradient(135deg, var(--accent-primary), var(--accent-secondary));
            border-radius: 4px 4px 0 0;
            transition: height 0.5s ease;
        }
        
        .tenure-label {
            font-size: 0.75rem;
            color: var(--text-secondary);
            margin-top: 5px;
        }
        
        /* Footer */
        .footer {
            margin-top: 40px; 
            padding: 20px; 
            background: var(--bg-tertiary); 
            border-radius: 8px; 
            text-align: center;
            color: var(--text-secondary);
        }
        
        .footer small {
            display: block;
            margin: 5px 0;
        }
        
        /* Print styles */
        @media print {
            body {
                background: white;
                color: black;
            }
            
            .theme-toggle {
                display: none;
            }
            
            .header {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
                page-break-inside: avoid;
            }
            
            .section {
                page-break-inside: avoid;
            }
            
            a:after {
                content: " (" attr(href) ")";
                font-size: 0.75rem;
                color: #666;
            }
            
            .social-links a:after {
                content: "";
            }
        }
        
        /* Accessibility improvements */
        @media (prefers-reduced-motion: reduce) {
            * {
                animation: none !important;
                transition: none !important;
            }
        }
        
        /* Focus styles */
        *:focus {
            outline: 3px solid var(--accent-primary);
            outline-offset: 2px;
        }
        
        /* Screen reader only text */
        .sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0,0,0,0);
            white-space: nowrap;
            border: 0;
        }
    </style>
</head>
<body>
    <a href="#main" class="skip-link">Skip to main content</a>
    
    <button class="theme-toggle" onclick="toggleTheme()" aria-label="Toggle dark mode">
        <span id="theme-icon">🌙</span>
    </button>
    
    <main id="main" class="container" role="main">
        <header class="header" role="banner">
            <h1>{{ name }}</h1>
            <p>{{ title }} | {{ role_type | capitalize }}</p>
            <div class="score-container">
                <div class="score {% if score >= 80 %}score-high{% elif score >= 60 %}score-medium{% else %}score-low{% endif %}">
                    Skill Match: {{ score }}%
                </div>
                {% if confidence %}
                <div class="confidence-meter" role="meter" aria-label="Assessment confidence" aria-valuenow="{{ (confidence * 100)|int }}" aria-valuemin="0" aria-valuemax="100">
                    <div class="confidence-bar">
                        <div class="confidence-fill" style="width: {{ (confidence * 100)|int }}%"></div>
                    </div>
                    <small>Confidence: {{ (confidence * 100)|int }}%</small>
                </div>
                {% endif %}
            </div>
        </header>
        
        <section class="section" aria-labelledby="summary-heading">
            <h2 id="summary-heading">📊 Executive Summary</h2>
            <p style="font-size: 1.1rem; line-height: 1.8;">{{ summary }}</p>
            
            {% if match_explanations %}
            <div style="margin-top: 15px;">
                <strong>Key Insights:</strong>
                <ul style="margin-top: 10px;">
                {% for explanation in match_explanations %}
                    <li>{{ explanation }}</li>
                {% endfor %}
                </ul>
            </div>
            {% endif %}
        </section>
        
        <section class="section" aria-labelledby="candidate-heading">
            <h2 id="candidate-heading">👤 Candidate Information</h2>
            <div class="info-grid">
                <div class="info-item">
                    <div class="info-label">Current Role</div>
                    <div>{{ current_role }}</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Experience</div>
                    <div>{{ experience }} years</div>
                </div>
                <div class="info-item">
                    <div class="info-label">Email</div>
                    <div><a href="mailto:{{ email }}">{{ email }}</a></div>
                </div>
                <div class="info-item">
                    <div class="info-label">Contact</div>
                    <div>{{ contact }}</div>
                </div>
            </div>
            
            {% if linkedin_url or github_url or portfolio_url %}
            <div class="social-links">
                {% if linkedin_url %}
                <a href="{{ linkedin_url }}" target="_blank" rel="noopener noreferrer">
                    <span>LinkedIn</span>
                </a>
                {% endif %}
                {% if github_url %}
                <a href="{{ github_url }}" target="_blank" rel="noopener noreferrer">
                    <span>GitHub</span>
                </a>
                {% endif %}
                {% if portfolio_url %}
                <a href="{{ portfolio_url }}" target="_blank" rel="noopener noreferrer">
                    <span>Portfolio</span>
                </a>
                {% endif %}
            </div>
            {% endif %}
            
            <div style="margin-top: 20px;">
                <div class="info-label">Skills</div>
                <div class="skill-container">
                    {% for skill in skills %}
                    <span class="skill {% if skill in matched_required %}skill-matched{% endif %}">{{ skill }}</span>
                    {% endfor %}
                </div>
            </div>
            
            {% if related_skills %}
            <div style="margin-top: 20px;">
                <div class="info-label">Related Skills</div>
                <div class="skill-container">
                    {% for skill in related_skills %}
                    <span class="skill skill-related">{{ skill }}</span>
                    {% endfor %}
                </div>
            </div>
            {% endif %}
        </section>
        
        <section class="section" aria-labelledby="career-heading">
            <h2 id="career-heading">📈 Career Analysis</h2>
            <p><strong>Progression:</strong> {{ progression }}</p>
            <p><strong>Growth Rate:</strong> <span style="text-transform: capitalize;">{{ growth_rate }}</span></p>
            
            {% if tenure_data %}
            <div class="tenure-chart" role="img" aria-label="Tenure per role chart">
                {% for role in tenure_data %}
                <div class="tenure-bar">
                    <div class="tenure-bar-fill" style="height: {{ role.months * 2 }}px"></div>
                    <div class="tenure-label">{{ role.role }}<br>{{ role.months }} mo</div>
                </div>
                {% endfor %}
            </div>
            {% endif %}
            
            {% if strengths %}
            <h3>Key Strengths</h3>
            <ul>
            {% for strength in strengths %}
                <li>{{ strength }}</li>
            {% endfor %}
            </ul>
            {% endif %}
        </section>
        
        {% if rubric_scores %}
        <section class="section" aria-labelledby="rubric-heading">
            <h2 id="rubric-heading">📋 Evaluation Rubric</h2>
            <div class="rubric-container">
                {% for score_item in rubric_scores %}
                <div class="rubric-item">
                    <div>
                        <strong>{{ score_item.criterion|replace('_', ' ')|title }}</strong>
                        {% if score_item.evidence %}
                        <br><small>{{ score_item.evidence }}</small>
                        {% endif %}
                    </div>
                    <div class="rubric-score" role="img" aria-label="{{ score_item.score }} out of 5">
                        {% for i in range(5) %}
                        <span class="score-dot {% if i < score_item.score %}filled{% endif %}"></span>
                        {% endfor %}
                    </div>
                </div>
                {% endfor %}
            </div>
        </section>
        {% endif %}
        
        {% if red_flags %}
        <section class="section" aria-labelledby="flags-heading">
            <h2 id="flags-heading">⚠️ Areas for Clarification</h2>
            {% for flag in red_flags %}
            <div class="red-flag">
                <strong>{{ flag.issue }}</strong> (Severity: {{ flag.severity }})
                <br><em>Suggested probe: {{ flag.suggested_probe }}</em>
                {% if flag.evidence %}
                <div class="evidence">Evidence: {{ flag.evidence }}</div>
                {% endif %}
            </div>
            {% endfor %}
        </section>
        {% endif %}
        
        <section class="section" aria-labelledby="questions-heading">
            <h2 id="questions-heading">💬 Recommended Interview Questions</h2>
            {% if question_categories %}
                {% for category, questions_list in question_categories.items() %}
                    <h3 style="margin-top: 20px; text-transform: capitalize;">{{ category }} Questions</h3>
                    {% for q in questions_list %}
                    <div class="question">
                        <span class="question-category">{{ q.category|default(category) }}</span>
                        <strong>Q{{ loop.index }}:</strong> {{ q.question }}
                        <br><br>
                        <em>Purpose:</em> {{ q.purpose }}
                        <br>
                        <em>Follow-up:</em> {{ q.follow_up }}
                        {% if q.red_flags %}
                        <br>
                        <em>Red flags:</em> {{ q.red_flags }}
                        {% endif %}
                    </div>
                    {% endfor %}
                {% endfor %}
            {% else %}
                {% for q in questions %}
                <div class="question">
                    {% if q.category %}
                    <span class="question-category">{{ q.category }}</span>
                    {% endif %}
                    <strong>Q{{ loop.index }}:</strong> {{ q.question }}
                    <br><br>
                    <em>Purpose:</em> {{ q.purpose }}
                    <br>
                    <em>Follow-up:</em> {{ q.follow_up }}
                    {% if q.red_flags %}
                    <br>
                    <em>Red flags:</em> {{ q.red_flags }}
                    {% endif %}
                </div>
                {% endfor %}
            {% endif %}
        </section>
        
        <footer class="footer" role="contentinfo">
            <small>Generated: {{ generated_at }}</small>
            <small>Model Version: {{ model_version }}</small>
            <small class="sr-only">End of selection sheet</small>
        </footer>
    </main>
    
    <script>
        // Theme toggle functionality
        function toggleTheme() {
            const body = document.body;
            const icon = document.getElementById('theme-icon');
            const currentTheme = body.getAttribute('data-theme');
            
            if (currentTheme === 'dark') {
                body.removeAttribute('data-theme');
                icon.textContent = '🌙';
                localStorage.setItem('theme', 'light');
            } else {
                body.setAttribute('data-theme', 'dark');
                icon.textContent = '☀️';
                localStorage.setItem('theme', 'dark');
            }
        }
        
        // Load saved theme preference
        window.addEventListener('DOMContentLoaded', () => {
            const savedTheme = localStorage.getItem('theme');
            const icon = document.getElementById('theme-icon');
            
            if (savedTheme === 'dark') {
                document.body.setAttribute('data-theme', 'dark');
                icon.textContent = '☀️';
            }
        });
        
        // Animate confidence bar on load
        window.addEventListener('load', () => {
            const confidenceFill = document.querySelector('.confidence-fill');
            if (confidenceFill) {
                const width = confidenceFill.style.width;
                confidenceFill.style.width = '0%';
                setTimeout(() => {
                    confidenceFill.style.width = width;
                }, 100);
            }
        });
    </script>
</body>
</html>
"""

class SheetTemplateManager:
    """Enhanced template manager with improved categorization"""
    
    def __init__(self):
        self.templates = {
            "engineering": {
                "sections": [
                    "candidate_overview",
                    "technical_assessment",
                    "coding_evaluation",
                    "system_design",
                    "career_trajectory",
                    "cultural_fit",
                    "red_flags",
                    "interview_questions"
                ],
                "evaluation_criteria": {
                    "technical_depth": {"weight": 0.35, "required": True},
                    "problem_solving": {"weight": 0.25, "required": True},
                    "system_design": {"weight": 0.20, "required": True},
                    "communication": {"weight": 0.10, "required": True},
                    "cultural_fit": {"weight": 0.10, "required": True}
                },
                "question_tags": ["technical", "debugging", "system_design", "behavioral"]
            },
            "management": {
                "sections": [
                    "candidate_overview",
                    "leadership_experience",
                    "team_building",
                    "strategic_thinking",
                    "technical_competence",
                    "career_trajectory",
                    "management_style",
                    "red_flags",
                    "interview_questions"
                ],
                "evaluation_criteria": {
                    "leadership": {"weight": 0.30, "required": True},
                    "strategic_thinking": {"weight": 0.25, "required": True},
                    "team_building": {"weight": 0.20, "required": True},
                    "technical_knowledge": {"weight": 0.15, "required": True},
                    "communication": {"weight": 0.10, "required": True}
                },
                "question_tags": ["leadership", "team_building", "strategy", "behavioral", "technical"]
            },
            "sales": {
                "sections": [
                    "candidate_overview",
                    "sales_performance",
                    "client_relationships",
                    "industry_knowledge",
                    "career_trajectory",
                    "communication_skills",
                    "red_flags",
                    "interview_questions"
                ],
                "evaluation_criteria": {
                    "sales_track_record": {"weight": 0.35, "required": True},
                    "communication": {"weight": 0.25, "required": True},
                    "relationship_building": {"weight": 0.20, "required": True},
                    "industry_knowledge": {"weight": 0.10, "required": True},
                    "negotiation": {"weight": 0.10, "required": True}
                },
                "question_tags": ["sales_performance", "client_relations", "negotiation", "behavioral"]
            }
        }
    
    def select_template(self, job, candidate):
        """Enhanced template selection with dynamic adjustments"""
        base_template = self.templates.get(job.role_type, self.templates["engineering"])
        
        template = {
            "sections": base_template["sections"].copy(),
            "evaluation_criteria": base_template["evaluation_criteria"].copy(),
            "question_tags": base_template.get("question_tags", []).copy()
        }
        
        # Dynamic adjustments based on seniority
        if job.seniority in ["senior", "lead", "principal"]:
            if "mentorship" not in template["evaluation_criteria"]:
                template["evaluation_criteria"]["mentorship"] = {"weight": 0.10, "required": False}
            template["question_tags"].append("mentorship")
            
        if job.seniority in ["lead", "principal", "director"]:
            template["question_tags"].append("architecture")
            
        # Special requirements adjustments
        if "security_clearance" in job.special_requirements:
            template["sections"].insert(2, "security_clearance_check")
            
        if "remote_work" in job.special_requirements:
            template["sections"].append("remote_work_assessment")
            template["evaluation_criteria"]["remote_collaboration"] = {"weight": 0.10, "required": False}
            
        # Skills-based adjustments
        if job.required_skills:
            if any(skill in ["machine learning", "ai", "deep learning"] for skill in job.required_skills):
                template["sections"].append("ml_expertise")
                template["question_tags"].append("machine_learning")
                
            if any(skill in ["kubernetes", "docker", "terraform"] for skill in job.required_skills):
                template["sections"].append("devops_assessment")
                template["question_tags"].append("infrastructure")
        
        return template