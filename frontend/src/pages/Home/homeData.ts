import type { Category } from './Category'

export const categoryStyles: Omit<Category, 'label'>[] = [
    {
        backgroundColor: '#FFF4C2',
        accentColor: '#C99A00',
        icon: 'wrench',
    },
    {
        backgroundColor: '#DDF2FF',
        accentColor: '#3182CE',
        icon: 'location',
    },
    {
        backgroundColor: '#FFE1E6',
        accentColor: '#D65A73',
        icon: 'star',
    },
    {
        backgroundColor: '#E9E2FF',
        accentColor: '#7B61C9',
        icon: 'document',
    },
    {
        backgroundColor: '#F7E5D1',
        accentColor: '#A66A32',
        icon: 'wrench',
    },
    {
        backgroundColor: '#DDF3DE',
        accentColor: '#4F8F52',
        icon: 'location',
    },
]

export const popularSearches = [
    'Electricista',
    'Plomero',
    'Pintor',
    'Cerrajero',
    'Reparación de calefón',
]
