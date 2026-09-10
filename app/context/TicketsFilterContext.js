import { createContext, useContext, useState } from 'react';

// Lets the shared page-title header (rendered by (main)/_layout.js, a
// sibling of the Tickets screen rather than an ancestor/descendant of it)
// show and control the Submitted/Assigned toggle next to the "Tickets"
// label, while TicketsScreen still owns the actual filtering.
const TicketsFilterContext = createContext();

export const useTicketsFilter = () => {
    const context = useContext(TicketsFilterContext);
    if (!context) {
        throw new Error('useTicketsFilter must be used within a TicketsFilterProvider');
    }
    return context;
};

export const TicketsFilterProvider = ({ children }) => {
    // 'submitted' = tickets I reported · 'assigned' = tickets assigned to me
    const [filter, setFilter] = useState('submitted');
    return (
        <TicketsFilterContext.Provider value={{ filter, setFilter }}>
            {children}
        </TicketsFilterContext.Provider>
    );
};
