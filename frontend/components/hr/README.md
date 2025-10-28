# HR Management Components

This directory contains modular components for the HR management system, broken down for better maintainability and code organization.

## Component Structure

### **HRHeader.jsx** (~20 lines)
- Header component with AITF branding
- Role toggle and user profile
- Mobile-responsive layout

### **JobList.jsx** (~80 lines)
- Job listing with active/archived tabs
- Empty state handling
- Loading states
- Integrates JobItem components

### **JobItem.jsx** (~120 lines)
- Individual job display with expand/collapse
- Mobile-responsive action buttons
- Interview rounds display
- Candidate status tabs
- Mobile menu integration

### **JobForm.jsx** (~120 lines)
- Job creation and editing modal
- Dynamic interview rounds management
- Form validation and submission
- Mobile-responsive layout

### **CandidateForm.jsx** (~120 lines)
- Candidate upload and management
- Resume parsing interface
- Navigation between candidates
- Form field editing
- Mobile-responsive design

### **MobileJobMenu.jsx** (~60 lines)
- Mobile dropdown menu for job actions
- Touch-friendly interactions
- Backdrop click handling
- Smooth animations

### **Notification.jsx** (~20 lines)
- Toast notification system
- Auto-dismiss functionality
- Error/success styling

## Benefits of Modular Structure

✅ **Maintainability**: Each component has a single responsibility
✅ **Reusability**: Components can be reused across different pages
✅ **Testing**: Easier to test individual components
✅ **Performance**: Better code splitting and loading
✅ **Collaboration**: Multiple developers can work on different components
✅ **Readability**: No file exceeds 400 lines of code

## Usage

```javascript
import HRHeader from '@/components/hr/HRHeader';
import JobList from '@/components/hr/JobList';
import JobForm from '@/components/hr/JobForm';
// ... other components
```

## Mobile Responsiveness

All components are designed with mobile-first approach:
- Responsive layouts with Tailwind CSS
- Touch-friendly button sizes
- Horizontal scrolling for tabs
- Collapsible mobile menus
- Optimized spacing and typography