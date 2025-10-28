"""Data models for candidates, jobs, and applications"""

from datetime import datetime
from typing import List, Dict, Any, Optional


class Candidate:
    def __init__(self, candidate_id, name, email, contact, resume_link, 
                 parsed_info, experience_years, current_role, skills, 
                 education, linkedin_url=None, github_url=None, portfolio_url=None):
        self.candidate_id = candidate_id
        self.name = name
        self.email = email
        self.contact = contact
        self.resume_link = resume_link
        self.parsed_info = parsed_info
        self.experience_years = experience_years
        self.current_role = current_role
        self.skills = skills
        self.education = education
        self.linkedin_url = linkedin_url
        self.github_url = github_url
        self.portfolio_url = portfolio_url


class Job:
    def __init__(self, job_id, title, description, status, role_type, 
                 seniority, required_skills, special_requirements=None, 
                 nice_to_have_skills=None, team_size=None, reports_to=None):
        self.job_id = job_id
        self.title = title
        self.description = description
        self.status = status
        self.role_type = role_type
        self.seniority = seniority
        self.required_skills = required_skills
        self.special_requirements = special_requirements or []
        self.nice_to_have_skills = nice_to_have_skills or []
        self.team_size = team_size
        self.reports_to = reports_to


class Application:
    def __init__(self, application_id, candidate_id, job_id, 
                 application_date, overall_status, stage, notes=None):
        self.application_id = application_id
        self.candidate_id = candidate_id
        self.job_id = job_id
        self.application_date = application_date
        self.overall_status = overall_status
        self.stage = stage
        self.notes = notes