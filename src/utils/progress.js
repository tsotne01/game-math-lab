// Progress tracking using localStorage
const STORAGE_KEY = 'game-math-lab-progress';

const Progress = {
    // Get all progress data
    getAll() {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : { completed: [], current: null };
    },

    // Save progress data
    save(data) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    },

    // Mark a module as completed
    completeModule(moduleId) {
        const data = this.getAll();
        if (!data.completed.includes(moduleId)) {
            data.completed.push(moduleId);
            this.save(data);
        }
        return data;
    },

    // Check if module is completed
    isCompleted(moduleId) {
        const data = this.getAll();
        return data.completed.includes(moduleId);
    },

    // Get completion percentage
    getPercentage(totalModules = 13) {
        const data = this.getAll();
        return Math.round((data.completed.length / totalModules) * 100);
    },

    // Set current module
    setCurrent(moduleId) {
        const data = this.getAll();
        data.current = moduleId;
        this.save(data);
    },

    // Reset all progress
    reset() {
        localStorage.removeItem(STORAGE_KEY);
    }
};

// Update UI on page load
document.addEventListener('DOMContentLoaded', () => {
    const progressFill = document.querySelector('.progress-fill');
    const progressText = document.querySelector('.progress-text');
    
    if (progressFill && progressText) {
        const data = Progress.getAll();
        const percentage = Progress.getPercentage();
        
        progressFill.style.width = `${percentage}%`;
        progressText.textContent = `${data.completed.length} / 13 modules completed`;
    }

    // Mark completed modules
    const moduleCards = document.querySelectorAll('.module-card');
    moduleCards.forEach((card, index) => {
        const moduleId = `module-${String(index + 1).padStart(2, '0')}`;
        if (Progress.isCompleted(moduleId)) {
            card.classList.add('completed');
        }
    });
});

// Export for use in modules
window.Progress = Progress;
