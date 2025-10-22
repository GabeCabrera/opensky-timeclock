import React, { useEffect, useRef } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

// Deprecated: MobileNav drawer removed in favor of persistent bottom navigation.
// This placeholder exports nothing substantial to keep import graph clean if any stale imports remain.
export default function MobileNav() { return null; }