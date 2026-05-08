import React, { useState, useEffect, useRef } from 'react';
import { MapPin, Clock, ArrowUp, ArrowDown, Trash2, Save, LogOut, Navigation, Play, Train, Footprints, Wand2, Bus, ArrowRight, Loader2, Users, Map as MapIcon, Calendar } from 'lucide-react';

// =====================================================================
// ★★★ 最速完成のための設定エリア ★★★
// =====================================================================
// 1. Google Maps APIキー
const GOOGLE_MAPS_API_KEY = "AIzaSyBUrrjAvxg8anEmnW5TkBYdUCkmnFXObTI";

// 2. GASのウェブアプリURL (https://script.google.com/.../exec)
const GAS_URL = import.meta.env.DEV && import.meta.env.VITE_GAS_PROXY_URL
  ? import.meta.env.VITE_GAS_PROXY_URL
  : "https://script.google.com/macros/s/AKfycbyAOGvlt0lVcexxL9NrpWpEC74PKZMC0aol1Gv7LYK-ADKm7KgUcuCh77XGhAcZm3689Q/exec";
const ADMIN_PIN = "admin";
// =====================================================================

export default function App() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isExportingTimeline, setIsExportingTimeline] = useState(false);
  const [groupInfo, setGroupInfo] = useState({ number: '', pin: '' });
  const [messageBox, setMessageBox] = useState(null);
  const [logoutConfirm, setLogoutConfirm] = useState(false);
  const [placePhotoUrls, setPlacePhotoUrls] = useState({});
  const [expandedPhoto, setExpandedPhoto] = useState(null);
  const [placeSuggestions, setPlaceSuggestions] = useState([]);
  const [newPlaceId, setNewPlaceId] = useState('');
  const [restrictToKyotoNara, setRestrictToKyotoNara] = useState(true);

  // --- Google Maps 用ステートとRef ---
  const [isMapLoaded, setIsMapLoaded] = useState(false);
  const [mapError, setMapError] = useState(null);
  const mapRef = useRef(null);
  const mapInstance = useRef(null);
  const directionsServiceRef = useRef(null);
  const geocoderRef = useRef(null);
  const placesServiceRef = useRef(null);
  const autocompleteServiceRef = useRef(null);
  const routeRenderersRef = useRef([]);
  const markersRef = useRef([]);
  const circlesRef = useRef([]);
  const ringMarkersRef = useRef([]);

  // --- 生徒用ステート ---
  const initialDaysData = [
    { id: 2, startTime: '09:00', destinations: [] },
    { id: 3, startTime: '09:00', destinations: [] }
  ];
  const [daysData, setDaysData] = useState(initialDaysData);
  const [currentDayId, setCurrentDayId] = useState(2);

  // --- 管理者用ステート ---
  const [allGroupsData, setAllGroupsData] = useState([]);
  const [adminViewDay, setAdminViewDay] = useState(2);

  // --- その他のステート ---
  const [newPlaceName, setNewPlaceName] = useState('');
  const [newStayTime, setNewStayTime] = useState(60);
  const [newTravelTime, setNewTravelTime] = useState(15);
  const [newTravelMode, setNewTravelMode] = useState('TRAIN');

  const currentDayData = daysData.find(d => d.id === currentDayId);
  const startTime = currentDayData?.startTime || '09:00';
  const destinations = currentDayData?.destinations || [];
  const visibleDestinations = destinations.filter(dest => dest.mapVisible !== false);
  const routeColors = ['#2563eb', '#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#be123c', '#4f46e5'];
  const kyotoNaraBounds = { south: 33.75, west: 134.80, north: 35.85, east: 136.35 };

  // --- Google Maps スクリプトのロード ---
  useEffect(() => {
    if (!GOOGLE_MAPS_API_KEY) {
      setIsMapLoaded(false);
      return;
    }
    if (window.google && window.google.maps) {
      setIsMapLoaded(true);
      return;
    }

    window.gm_authFailure = () => {
      setMapError("Google Maps APIキーが拒否されました。Google Cloud ConsoleでAPIキー、HTTPリファラー、請求先、Maps JavaScript APIの有効化を確認してください。");
      setIsMapLoaded(false);
    };

    const scriptId = 'google-maps-script';
    let script = document.getElementById(scriptId);

    if (!script) {
      script = document.createElement('script');
      script.id = scriptId;
      script.src = `https://maps.googleapis.com/maps/api/js?key=${GOOGLE_MAPS_API_KEY}&libraries=places&loading=async`;
      script.async = true;
      script.defer = true;
      document.head.appendChild(script);
    }

    const handleLoad = () => { setIsMapLoaded(true); setMapError(null); };
    const handleError = () => { setMapError("Google Mapsの読み込みに失敗しました。APIキーを確認してください。"); setIsMapLoaded(false); };

    script.addEventListener('load', handleLoad);
    script.addEventListener('error', handleError);

    return () => {
      script.removeEventListener('load', handleLoad);
      script.removeEventListener('error', handleError);
    };
  }, []);

  // --- 地図の初期化 ---
  useEffect(() => {
    if (!isLoggedIn || isAdminMode) {
      routeRenderersRef.current.forEach(renderer => renderer.setMap(null));
      markersRef.current.forEach(marker => marker.setMap(null));
      circlesRef.current.forEach(circle => circle.setMap(null));
      ringMarkersRef.current.forEach(marker => marker.setMap(null));
      mapInstance.current = null;
      directionsServiceRef.current = null;
      geocoderRef.current = null;
      placesServiceRef.current = null;
      autocompleteServiceRef.current = null;
      routeRenderersRef.current = [];
      markersRef.current = [];
      circlesRef.current = [];
      ringMarkersRef.current = [];
      return;
    }

    if (isMapLoaded && isLoggedIn && !isAdminMode && mapRef.current && !mapInstance.current) {
      try {
        mapInstance.current = new window.google.maps.Map(mapRef.current, {
          center: { lat: 35.0116, lng: 135.7681 }, // 京都市役所付近
          zoom: 12,
          mapTypeControl: false,
          streetViewControl: false,
        });
        directionsServiceRef.current = new window.google.maps.DirectionsService();
        geocoderRef.current = new window.google.maps.Geocoder();
        placesServiceRef.current = new window.google.maps.places.PlacesService(mapInstance.current);
        autocompleteServiceRef.current = new window.google.maps.places.AutocompleteService();
      } catch (error) {
        setMapError("地図の描画中にエラーが発生しました。ブラウザを再読み込みしても直らない場合は、Google Maps APIキーの設定を確認してください。");
      }
    }
  }, [isMapLoaded, isLoggedIn, isAdminMode]);

  // --- 地図上のルート描画 ---
  useEffect(() => {
    if (!isMapLoaded || !mapInstance.current || !directionsServiceRef.current || !geocoderRef.current) return;

    let isCancelled = false;
    routeRenderersRef.current.forEach(renderer => renderer.setMap(null));
    markersRef.current.forEach(marker => marker.setMap(null));
    circlesRef.current.forEach(circle => circle.setMap(null));
    ringMarkersRef.current.forEach(marker => marker.setMap(null));
    routeRenderersRef.current = [];
    markersRef.current = [];
    circlesRef.current = [];
    ringMarkersRef.current = [];

    if (visibleDestinations.length === 0) return;

    const bounds = new window.google.maps.LatLngBounds();
    const geocodePlace = (dest) => new Promise((resolve) => {
      if (dest.placeId) {
        geocoderRef.current.geocode({ placeId: dest.placeId }, (results, status) => {
          if (status === 'OK' && results?.[0]?.geometry?.location) {
            resolve(results[0].geometry.location);
          } else {
            console.warn(`地点の検索に失敗しました: ${dest.name} (${status})`);
            resolve(null);
          }
        });
        return;
      }

      if (!placesServiceRef.current) {
        resolve(null);
        return;
      }

      placesServiceRef.current.findPlaceFromQuery({
        query: dest.name,
        fields: ['name', 'geometry', 'formatted_address']
      }, (results, status) => {
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.length === 1 && results[0]?.geometry?.location) {
          resolve(results[0].geometry.location);
        } else {
          console.warn(`地点が明確に特定できないため地図表示をスキップしました: ${dest.name} (${status})`);
          resolve(null);
        }
      });
    });

    const drawMap = async () => {
      const locations = await Promise.all(visibleDestinations.map(dest => geocodePlace(dest)));
      if (isCancelled) return;

      locations.forEach((location, index) => {
        if (!location) return;
        bounds.extend(location);
        const displayNumber = destinations.findIndex(dest => dest.id === visibleDestinations[index].id) + 1;
        const marker = new window.google.maps.Marker({
          map: mapInstance.current,
          position: location,
          label: String(displayNumber),
          title: visibleDestinations[index].name,
          zIndex: 20 + index,
        });
        const ringMarker = new window.google.maps.Marker({
          map: mapInstance.current,
          position: location,
          clickable: false,
          zIndex: 10 + index,
          icon: {
            path: window.google.maps.SymbolPath.CIRCLE,
            scale: 22,
            fillColor: '#ef4444',
            fillOpacity: 0.08,
            strokeColor: '#dc2626',
            strokeOpacity: 0.95,
            strokeWeight: 4,
          },
        });
        const circle = new window.google.maps.Circle({
          map: mapInstance.current,
          center: location,
          radius: visibleDestinations.length === 1 ? 180 : 130,
          strokeColor: '#dc2626',
          strokeOpacity: 0.95,
          strokeWeight: 3,
          fillColor: '#ef4444',
          fillOpacity: 0.14,
        });
        markersRef.current.push(marker);
        ringMarkersRef.current.push(ringMarker);
        circlesRef.current.push(circle);
      });

      for (let index = 1; index < visibleDestinations.length; index++) {
        const previous = visibleDestinations[index - 1];
        const current = visibleDestinations[index];
        const previousLocation = locations[index - 1];
        const currentLocation = locations[index];
        if (!previousLocation || !currentLocation) continue;

        const travelMode = current.travelMode === 'WALKING'
          ? window.google.maps.TravelMode.WALKING
          : window.google.maps.TravelMode.TRANSIT;

        directionsServiceRef.current.route({
          origin: previousLocation,
          destination: currentLocation,
          travelMode,
          transitOptions: travelMode === window.google.maps.TravelMode.TRANSIT
            ? { departureTime: new Date() }
            : undefined,
        }, (response, status) => {
          if (isCancelled) return;
          if (status === 'OK') {
            const renderer = new window.google.maps.DirectionsRenderer({
              map: mapInstance.current,
              suppressMarkers: true,
              preserveViewport: true,
              polylineOptions: {
                strokeColor: routeColors[(index - 1) % routeColors.length],
                strokeOpacity: 0.8,
                strokeWeight: 5,
              },
            });
            renderer.setDirections(response);
            routeRenderersRef.current.push(renderer);
          } else {
            console.warn(`ルート検索に失敗しました: ${previous.name} -> ${current.name} (${status})`);
          }
        });
      }

      if (!bounds.isEmpty()) {
        window.google.maps.event.trigger(mapInstance.current, 'resize');
        if (visibleDestinations.length === 1) {
          mapInstance.current.setCenter(bounds.getCenter());
          mapInstance.current.setZoom(15);
        } else {
          mapInstance.current.fitBounds(bounds, 96);
        }
      }
    };

    drawMap();

    return () => {
      isCancelled = true;
      routeRenderersRef.current.forEach(renderer => renderer.setMap(null));
      markersRef.current.forEach(marker => marker.setMap(null));
      circlesRef.current.forEach(circle => circle.setMap(null));
      ringMarkersRef.current.forEach(marker => marker.setMap(null));
      routeRenderersRef.current = [];
      markersRef.current = [];
      circlesRef.current = [];
      ringMarkersRef.current = [];
    };
  }, [destinations, isMapLoaded, restrictToKyotoNara]);

  // --- 地点写真プレビューの取得 ---
  useEffect(() => {
    if (!isMapLoaded || !placesServiceRef.current || destinations.length === 0) return;

    let isCancelled = false;
    const pendingDestinations = destinations.filter(dest => dest.name && placePhotoUrls[dest.name] === undefined);
    if (pendingDestinations.length === 0) return;

    pendingDestinations.forEach(dest => {
      placesServiceRef.current.findPlaceFromQuery({
        query: dest.name,
        fields: ['name', 'photos']
      }, (results, status) => {
        if (isCancelled) return;

        let photoUrl = null;
        if (status === window.google.maps.places.PlacesServiceStatus.OK && results?.[0]?.photos?.[0]) {
          photoUrl = results[0].photos[0].getUrl({ maxWidth: 640, maxHeight: 420 });
        }

        setPlacePhotoUrls(prev => ({
          ...prev,
          [dest.name]: photoUrl,
        }));
      });
    });

    return () => {
      isCancelled = true;
    };
  }, [destinations, isMapLoaded, placePhotoUrls]);

  // --- ログイン・データ取得処理 (GAS通信) ---
  const handleLogin = async (e) => {
    e.preventDefault();
    if (!GAS_URL) {
      setMessageBox({ title: "準備中", content: "GASのURLが設定されていません。" });
      return;
    }
    if (!groupInfo.number || !groupInfo.pin) return;

    setIsLoading(true);

    try {
      // データの取得
      const response = await fetch(GAS_URL);
      const allData = await response.json();

      if (groupInfo.number === 'admin') {
        if (groupInfo.pin === ADMIN_PIN) {
          setIsAdminMode(true);

          // 管理者用に全データをセット
          const formattedAdminData = allData.map(item => ({
            groupNumber: parseInt(item.groupNumber),
            pin: item.pin || '',
            daysData: item.data
          })).sort((a, b) => a.groupNumber - b.groupNumber);

          setAllGroupsData(formattedAdminData);
          setIsLoggedIn(true);
        } else {
          setMessageBox({ title: "エラー", content: "管理者パスワードが間違っています。" });
        }
        setIsLoading(false);
        return;
      }

      // 生徒用ログイン
      const myGroup = allData.find(d => d.groupNumber == groupInfo.number);

      if (myGroup) {
        if (String(myGroup.pin) !== String(groupInfo.pin)) {
          setMessageBox({ title: "エラー", content: "PIN（暗証番号）が間違っています。" });
          setIsLoading(false);
          return;
        }
        setDaysData(myGroup.data.length > 0 ? myGroup.data : initialDaysData);
        setMessageBox({ title: "読み込み完了", content: `第${groupInfo.number}班のデータを読み込みました。` });
      } else {
        // 新規登録の扱いでスタート
        setDaysData(initialDaysData);
        setMessageBox({ title: "新規登録", content: `第${groupInfo.number}班として新規登録しました。\nPINは大切に保管してください。` });
      }
      setIsAdminMode(false);
      setIsLoggedIn(true);

    } catch (error) {
      console.error("通信エラー:", error);
      setMessageBox({ title: "通信エラー", content: "スプレッドシートとの通信に失敗しました。URLを確認してください。" });
    }
    setIsLoading(false);
  };

  // --- 管理者用：全班データの再取得 ---
  const fetchAllGroupsData = async () => {
    try {
      const response = await fetch(GAS_URL);
      const allData = await response.json();
      const formattedAdminData = allData.map(item => ({
        groupNumber: parseInt(item.groupNumber),
        pin: item.pin || '',
        daysData: item.data
      })).sort((a, b) => a.groupNumber - b.groupNumber);

      setAllGroupsData(formattedAdminData);
    } catch (error) {
      setMessageBox({ title: "エラー", content: "データの最新化に失敗しました。" });
    }
  };

  const exportTimelineToSheet = async () => {
    if (!GAS_URL || isExportingTimeline) return;

    setIsExportingTimeline(true);
    setMessageBox({
      title: "出力中",
      content: "管理者用タイムラインをスプレッドシートに出力しています。完了まで少し待ってください。"
    });

    try {
      const separator = GAS_URL.includes('?') ? '&' : '?';
      const response = await fetch(`${GAS_URL}${separator}action=timeline`);
      const result = await response.json();

      if (Array.isArray(result)) {
        throw new Error("GASのWebアプリが古いコードを実行しています。doGet(e) が action=timeline を処理できていません。GASを保存し、デプロイを新しいバージョンに更新してください。");
      }

      if (result.status !== 'success') {
        throw new Error(result.message || result.error || 'timeline export failed');
      }

      setMessageBox({
        title: "出力完了",
        content: "管理者用タイムラインをスプレッドシートに出力しました。"
      });
    } catch (error) {
      console.error("タイムライン出力エラー:", error);
      setMessageBox({
        title: "エラー",
        content: `タイムラインの出力に失敗しました。\n\n${error.message || error}\n\nGASを保存したあと、「デプロイを管理」から新しいバージョンとして反映してください。`
      });
    }
    setIsExportingTimeline(false);
  };

  // --- 保存処理 (GAS通信) ---
  const handleSave = async () => {
    if (!GAS_URL || !groupInfo.number || isAdminMode) return;
    setIsSaving(true);

    const updatedDaysData = daysData.map(day => {
      if (day.id === currentDayId) {
        return { ...day, destinations: scheduledDestinations };
      }
      return day;
    });

    try {
      const payload = {
        groupNumber: groupInfo.number,
        pin: groupInfo.pin,
        data: updatedDaysData
      };

      await fetch(GAS_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain', // GASのCORS回避のためtext/plain
        },
        body: JSON.stringify(payload)
      });

      setDaysData(updatedDaysData);
      setMessageBox({ title: "保存完了", content: "スプレッドシートに保存しました。" });
    } catch (error) {
      console.error("保存エラー:", error);
      setMessageBox({ title: "エラー", content: "保存に失敗しました。" });
    }
    setIsSaving(false);
  };

  // --- 生徒用スケジュール計算ロジック ---
  const updateCurrentDay = (updates) => {
    setDaysData(daysData.map(day => day.id === currentDayId ? { ...day, ...updates } : day));
  };

  const estimateTravelTime = () => {
    if (!newPlaceName || destinations.length === 0 || !directionsServiceRef.current || !window.google?.maps) {
      let estimated = 15;
      if (newTravelMode === 'WALKING') estimated = 30;
      if (newTravelMode === 'BUS') estimated = 25;
      if (newTravelMode === 'TRAIN') estimated = 15;
      setNewTravelTime(estimated);
      return;
    }

    const previousPlace = destinations[destinations.length - 1].name;
    const routeOrigin = previousPlace;
    const routeDestination = newPlaceName;
    const travelMode = newTravelMode === 'WALKING'
      ? window.google.maps.TravelMode.WALKING
      : window.google.maps.TravelMode.TRANSIT;
    const transitModes = newTravelMode === 'TRAIN'
      ? [window.google.maps.TransitMode.TRAIN]
      : newTravelMode === 'BUS'
        ? [window.google.maps.TransitMode.BUS]
        : undefined;

    const applyRouteResult = (response) => {
      const leg = response.routes?.[0]?.legs?.[0];
      const durationSeconds = leg?.duration?.value;
      if (durationSeconds) {
        setNewTravelTime(Math.max(1, Math.ceil(durationSeconds / 60)));
        return true;
      }

      return false;
    };

    directionsServiceRef.current.route({
      origin: routeOrigin,
      destination: routeDestination,
      travelMode,
      transitOptions: travelMode === window.google.maps.TravelMode.TRANSIT
        ? {
            departureTime: new Date(),
            modes: transitModes,
            routingPreference: window.google.maps.TransitRoutePreference.FEWER_TRANSFERS,
          }
        : undefined,
    }, (response, status) => {
      if (status === 'OK') {
        if (applyRouteResult(response)) {
          return;
        }
      }

      setMessageBox({
        title: "見積りエラー",
        content: travelMode === window.google.maps.TravelMode.TRANSIT
          ? "Google Mapsで公共交通の所要時間を見積もれませんでした。候補から駅名を選び直すか、鉄道検索の結果をもとに移動時間を手入力してください。"
          : "Google Mapsで移動時間を見積もれませんでした。候補からより具体的な場所名を選ぶか、移動時間を手入力してください。"
      });
    });
  };

  const addMinutes = (timeString, minutesToAdd) => {
    if (!timeString) return "00:00";
    const [hours, minutes] = timeString.split(':').map(Number);
    const date = new Date(2024, 0, 1, hours, minutes + Number(minutesToAdd));
    return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
  };

  const calculateSchedule = () => {
    let currentTime = startTime;
    return destinations.map((dest, index) => {
      const isStart = index === 0;
      const actualTravelTime = isStart ? 0 : dest.travelTime;
      const arrivalTime = addMinutes(currentTime, actualTravelTime);
      const actualStayTime = isStart ? 0 : dest.stayTime;
      const departureTime = addMinutes(arrivalTime, actualStayTime);
      currentTime = departureTime;
      return { ...dest, arrivalTime, departureTime, isStart };
    });
  };

  const scheduledDestinations = calculateSchedule();

  const handleAddPlace = (e) => {
    e.preventDefault();
    if (!newPlaceName) return;
    const isFirst = destinations.length === 0;
    const newPlace = {
      id: Date.now().toString(),
      name: newPlaceName,
      stayTime: isFirst ? 0 : Number(newStayTime),
      travelTime: isFirst ? 0 : Number(newTravelTime),
      travelMode: isFirst ? 'NONE' : newTravelMode,
      placeId: newPlaceId,
      mapVisible: true,
    };
    updateCurrentDay({ destinations: [...destinations, newPlace] });
    setNewPlaceName('');
    setNewPlaceId('');
  };

  const moveDestination = (index, direction) => {
    if (direction === 'up' && index > 1) {
      const newDests = [...destinations];
      [newDests[index - 1], newDests[index]] = [newDests[index], newDests[index - 1]];
      updateCurrentDay({ destinations: newDests });
    } else if (direction === 'down' && index > 0 && index < destinations.length - 1) {
      const newDests = [...destinations];
      [newDests[index + 1], newDests[index]] = [newDests[index], newDests[index + 1]];
      updateCurrentDay({ destinations: newDests });
    }
  };

  const removeDestination = (id) => {
    const targetIndex = destinations.findIndex(d => d.id === id);
    if (targetIndex === 0) updateCurrentDay({ destinations: [] });
    else updateCurrentDay({ destinations: destinations.filter(d => d.id !== id) });
  };

  const getTravelModeIcon = (mode) => {
    switch(mode) { case 'WALKING': return <Footprints size={14} />; case 'BUS': return <Bus size={14} />; case 'TRAIN': return <Train size={14} />; default: return <Navigation size={14} />; }
  };

  const getTravelModeName = (mode) => {
    switch(mode) { case 'WALKING': return '徒歩'; case 'BUS': return 'バス'; case 'TRAIN': return '電車'; default: return '移動'; }
  };

  const getRouteColor = (segmentIndex) => routeColors[segmentIndex % routeColors.length];

  const isPlaceVisibleOnMap = (dest) => dest.mapVisible !== false;

  const togglePlaceVisibility = (id) => {
    updateCurrentDay({
      destinations: destinations.map(dest => (
        dest.id === id ? { ...dest, mapVisible: dest.mapVisible === false } : dest
      ))
    });
  };

  const fetchPlaceSuggestions = (input, setter, options = {}) => {
    if (!input || input.trim().length < 2 || !autocompleteServiceRef.current || !window.google?.maps?.places) {
      setter([]);
      return;
    }

    const request = {
      input: input.trim(),
      componentRestrictions: { country: 'jp' },
      language: 'ja',
    };

    if (options.transitOnly) {
      request.types = ['transit_station'];
    } else {
      request.types = ['establishment', 'geocode'];
    }

    if (restrictToKyotoNara && kyotoNaraBounds) {
      request.bounds = kyotoNaraBounds;
    }

    autocompleteServiceRef.current.getPlacePredictions(request, (predictions, status) => {
      if (status === window.google.maps.places.PlacesServiceStatus.OK && predictions) {
        setter(predictions.slice(0, 5));
      } else {
        setter([]);
      }
    });
  };

  const renderSuggestions = (suggestions, onSelect) => {
    if (suggestions.length === 0) return null;

    return (
      <div className="absolute left-0 right-0 top-full mt-1 z-30 bg-white border border-slate-200 rounded-lg shadow-lg overflow-hidden">
        {suggestions.map(suggestion => (
          <button
            key={suggestion.place_id}
            type="button"
            onClick={() => {
              onSelect({
                label: suggestion.structured_formatting?.main_text || suggestion.description,
                placeId: suggestion.place_id || '',
              });
            }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-blue-50 border-b border-slate-100 last:border-b-0"
          >
            <span className="block font-medium text-slate-800">{suggestion.structured_formatting?.main_text || suggestion.description}</span>
            {suggestion.structured_formatting?.secondary_text && (
              <span className="block text-slate-500 mt-0.5">{suggestion.structured_formatting.secondary_text}</span>
            )}
          </button>
        ))}
      </div>
    );
  };

  const lastDepartureTime = scheduledDestinations.length > 0 ? scheduledDestinations[scheduledDestinations.length - 1].departureTime : startTime;
  const previewArrivalTime = addMinutes(lastDepartureTime, newTravelTime || 0);
  const previewDepartureTime = addMinutes(previewArrivalTime, newStayTime || 0);

  // --- 地図エリアのレンダリング関数 ---
  const renderMapArea = () => {
    if (!GOOGLE_MAPS_API_KEY) {
      return (
        <div className="w-full h-full bg-slate-200 flex flex-col items-center justify-center p-6 relative overflow-hidden">
          <MapIcon size={48} className="text-slate-400 mb-4" />
          <h3 className="text-xl font-bold text-slate-700 mb-2">Google Maps 準備中</h3>
          <p className="text-slate-500 text-center text-sm mb-6 max-w-sm">
            `.env.local` に Google Maps API キーを設定してください。
          </p>
        </div>
      );
    }

    if (mapError) {
      return (
        <div className="w-full h-full bg-red-50 flex flex-col items-center justify-center p-6 border border-red-200 rounded-xl">
          <MapIcon size={48} className="text-red-400 mb-4" />
          <h3 className="text-xl font-bold text-red-700 mb-2">地図エラー</h3>
          <p className="text-red-500 text-center text-sm">{mapError}</p>
        </div>
      );
    }

    return (
      <div className="w-full h-full relative bg-slate-200 rounded-xl overflow-hidden shadow-inner border border-slate-300">
        <div ref={mapRef} className="w-full h-full absolute inset-0"></div>
        {!isMapLoaded && (
          <div className="absolute inset-0 bg-slate-200 flex flex-col items-center justify-center z-10">
            <Loader2 size={32} className="text-slate-400 animate-spin mb-4" />
            <p className="text-slate-500 font-medium">地図を読み込み中...</p>
          </div>
        )}
      </div>
    );
  };


  // =====================================================================
  // --- レンダリング: ログイン画面 ---
  // =====================================================================
  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-slate-100 flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-xl shadow-lg max-w-md w-full">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-slate-800 mb-2">観光ルート作成アプリ</h1>
            <p className="text-slate-500">班の情報を入力して始めてください</p>
          </div>
          <form onSubmit={handleLogin} className="space-y-6">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">班番号</label>
              <select className="w-full p-3 border border-slate-300 rounded-lg outline-none" value={groupInfo.number} onChange={(e) => setGroupInfo({...groupInfo, number: e.target.value})} required>
                <option value="">選択してください</option>
                {Array.from({ length: 14 }, (_, i) => String(i + 1).padStart(2, '0')).map(groupNumber => (
                  <option key={groupNumber} value={groupNumber}>{groupNumber}班</option>
                ))}
                <option disabled>──────────</option>
                <option value="admin">【管理者 (先生用)】</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">PIN（暗証番号）</label>
              <input type="password" className="w-full p-3 border border-slate-300 rounded-lg outline-none" placeholder={groupInfo.number === 'admin' ? "管理者パスワード" : "初回の入力が登録PINになります"} value={groupInfo.pin} onChange={(e) => setGroupInfo({...groupInfo, pin: e.target.value})} required />
            </div>
            <button type="submit" disabled={isLoading} className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-medium py-3 px-4 rounded-lg flex justify-center items-center gap-2">
              {isLoading ? <Loader2 size={20} className="animate-spin" /> : <Play size={20} />}
              {isLoading ? '通信中...' : 'スタート'}
            </button>
          </form>
        </div>
        {messageBox && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
              <h3 className="text-lg font-bold text-slate-800 mb-2">{messageBox.title}</h3>
              <p className="text-slate-600 mb-6 whitespace-pre-wrap text-sm leading-relaxed">{messageBox.content}</p>
              <button onClick={() => setMessageBox(null)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium">確認</button>
            </div>
          </div>
        )}
      </div>
    );
  }

  // =====================================================================
  // --- レンダリング: 管理者ダッシュボード ---
  // =====================================================================
  if (isAdminMode) {
    return (
      <div className="min-h-screen bg-slate-100 flex flex-col">
        <header className="bg-slate-800 text-white border-b border-slate-700 sticky top-0 z-20 shadow-md">
          <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Users size={24} className="text-blue-400" />
              <h1 className="text-lg font-bold">先生用 管理ダッシュボード</h1>
            </div>
            <div className="flex items-center gap-3">
              <button onClick={exportTimelineToSheet} disabled={isExportingTimeline} className="text-sm bg-red-600 hover:bg-red-500 disabled:bg-red-400 px-3 py-1.5 rounded-lg transition-colors flex items-center gap-1.5">
                {isExportingTimeline && <Loader2 size={14} className="animate-spin" />}
                {isExportingTimeline ? '出力中...' : 'タイムライン出力'}
              </button>
              <button onClick={fetchAllGroupsData} className="text-sm bg-slate-700 hover:bg-slate-600 px-3 py-1.5 rounded-lg transition-colors">データ最新化</button>
              <button onClick={() => { setIsLoggedIn(false); setIsAdminMode(false); }} className="flex items-center gap-2 text-slate-300 hover:text-white px-2 py-2">
                <LogOut size={16} /> ログアウト
              </button>
            </div>
          </div>
        </header>

        <div className="bg-white border-b border-slate-200 sticky top-16 z-10 shadow-sm">
          <div className="max-w-7xl mx-auto px-4 flex">
            {[2, 3].map(dayId => (
              <button key={dayId} onClick={() => setAdminViewDay(dayId)} className={`px-8 py-4 font-medium text-sm border-b-2 transition-colors flex items-center gap-2 ${adminViewDay === dayId ? 'border-blue-600 text-blue-700 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-800 hover:bg-slate-50'}`}>
                <Calendar size={16} /> {dayId}日目
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-x-auto p-6">
          <div className="flex gap-6 min-w-max">
            {allGroupsData.map(group => {
              const dayData = group.daysData.find(d => d.id === adminViewDay);
              const dests = dayData?.destinations || [];

              return (
                <div key={group.groupNumber} className="w-80 bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col overflow-hidden">
                  <div className="bg-blue-50 p-4 border-b border-blue-100 flex justify-between items-center">
                    <div>
                      <h2 className="font-bold text-blue-900 text-lg">{group.groupNumber}班</h2>
                      <p className="text-xs text-blue-700 mt-1">PIN: <span className="font-mono font-semibold">{group.pin || '未設定'}</span></p>
                    </div>
                    {dests.length > 0 && <span className="text-xs bg-blue-200 text-blue-800 px-2 py-1 rounded-full font-medium">出発 {dayData.startTime}</span>}
                  </div>

                  <div className="p-4 flex-1 overflow-y-auto max-h-[calc(100vh-280px)]">
                    {dests.length === 0 ? (
                      <div className="h-full flex items-center justify-center text-slate-400 text-sm py-10">行程が未作成です</div>
                    ) : (
                      <div className="relative border-l-2 border-slate-200 ml-2 pl-4 space-y-4">
                        {dests.map((dest, idx) => (
                          <div key={idx} className="relative">
                            <div className={`absolute -left-[21px] top-1.5 w-3 h-3 rounded-full border-2 border-white ${dest.isStart ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                            <div className="text-xs font-bold text-slate-500 mb-0.5">{dest.isStart ? '出発' : dest.arrivalTime} 〜 {dest.departureTime}</div>
                            <div className="font-semibold text-slate-800 text-sm">{dest.name}</div>
                            {idx < dests.length - 1 && dests[idx+1] && (
                              <div className="mt-2 text-xs text-slate-500 bg-slate-50 px-2 py-1 rounded inline-block">↓ {dests[idx+1].travelTime}分</div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {allGroupsData.length === 0 && (
              <div className="w-full text-center py-20 text-slate-500 flex flex-col items-center">
                <Users size={48} className="text-slate-300 mb-4" />
                <p>保存された班のデータがありません。</p>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // =====================================================================
  // --- レンダリング: メイン画面 (生徒用) ---
  // =====================================================================
  return (
    <div className="min-h-screen bg-slate-50 flex flex-col">
      <header className="bg-white border-b border-slate-200 sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-lg font-bold text-slate-800">第 {groupInfo.number} 班 の行程表</h1>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-green-400 text-white px-4 py-2 rounded-lg text-sm font-medium">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
              <span className="hidden sm:inline">{isSaving ? '保存中...' : 'シートに保存'}</span>
            </button>
            <button onClick={() => setLogoutConfirm(true)} className="flex items-center gap-2 text-slate-500 hover:text-slate-800 px-2 py-2">
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </header>

      <div className="bg-white border-b border-slate-200 sticky top-16 z-10">
        <div className="max-w-7xl mx-auto px-4 flex overflow-x-auto">
          {[2, 3].map(dayId => (
            <button key={dayId} onClick={() => setCurrentDayId(dayId)} className={`px-6 py-3 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${currentDayId === dayId ? 'border-blue-600 text-blue-600 bg-blue-50/50' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'}`}>
              {dayId}日目
            </button>
          ))}
        </div>
      </div>

      <div className="flex-1 max-w-7xl mx-auto w-full p-4 flex flex-col lg:flex-row gap-6">
        <div className="w-full lg:w-1/2 flex flex-col gap-4">

          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="text-blue-600" size={20} />
              <h2 className="font-semibold text-slate-800">出発設定</h2>
            </div>
            <div className="flex items-center gap-4">
              <label className="text-sm text-slate-600">最初の出発時刻:</label>
              <input type="time" value={startTime} onChange={(e) => updateCurrentDay({ startTime: e.target.value })} className="p-2 border border-slate-300 rounded-lg outline-none" />
            </div>
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200">
            <h2 className="font-semibold text-slate-800 mb-4 flex items-center gap-2">
              <MapPin className="text-red-500" size={20} />
              {destinations.length === 0 ? '出発地を設定' : '次の目的地を追加'}
            </h2>
            <label className="mb-3 inline-flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={restrictToKyotoNara}
                onChange={(e) => {
                  setRestrictToKyotoNara(e.target.checked);
                  setPlaceSuggestions([]);
                  setNewPlaceId('');
                }}
                className="h-4 w-4 rounded border-slate-300 text-blue-600"
              />
              京都・奈良だけを候補にする
            </label>

            {destinations.length === 0 ? (
              <form onSubmit={handleAddPlace} className="flex flex-col gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="出発地の名前"
                    className="w-full p-3 border border-slate-300 rounded-lg outline-none"
                    value={newPlaceName}
                    onChange={(e) => {
                      setNewPlaceName(e.target.value);
                      setNewPlaceId('');
                      fetchPlaceSuggestions(e.target.value, setPlaceSuggestions);
                    }}
                    onBlur={() => window.setTimeout(() => setPlaceSuggestions([]), 150)}
                    required
                  />
                  {renderSuggestions(placeSuggestions, (suggestion) => {
                    setNewPlaceName(suggestion.label);
                    setNewPlaceId(suggestion.placeId);
                    setPlaceSuggestions([]);
                  })}
                </div>
                <button type="submit" className="w-full bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-medium">出発地を決定</button>
              </form>
            ) : (
              <form onSubmit={handleAddPlace} className="flex flex-col gap-3">
                <div className="relative">
                  <input
                    type="text"
                    placeholder="目的地の名前（例：金閣寺）"
                    className="w-full p-3 border border-slate-300 rounded-lg outline-none"
                    value={newPlaceName}
                    onChange={(e) => {
                      setNewPlaceName(e.target.value);
                      setNewPlaceId('');
                      fetchPlaceSuggestions(e.target.value, setPlaceSuggestions);
                    }}
                    onBlur={() => window.setTimeout(() => setPlaceSuggestions([]), 150)}
                    required
                  />
                  {renderSuggestions(placeSuggestions, (suggestion) => {
                    setNewPlaceName(suggestion.label);
                    setNewPlaceId(suggestion.placeId);
                    setPlaceSuggestions([]);
                  })}
                </div>

                <div className="flex flex-col gap-2 bg-slate-50 p-3 rounded-lg border border-slate-200">
                  <div className="flex items-center justify-between gap-2">
                    <label className="block text-xs font-semibold text-slate-600">移動手段</label>
                    {(newTravelMode === 'TRAIN' || newTravelMode === 'BUS') && (
                      <span className="text-xs font-bold text-red-600">所要時間は検索してください</span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <select className="flex-1 p-2 border border-slate-300 rounded-lg outline-none text-sm bg-white" value={newTravelMode} onChange={(e) => setNewTravelMode(e.target.value)}>
                      <option value="TRAIN">電車</option><option value="BUS">バス</option><option value="WALKING">徒歩</option>
                    </select>
                    <button type="button" onClick={estimateTravelTime} className="flex items-center justify-center gap-1 bg-blue-100 text-blue-700 px-3 py-2 rounded-lg text-sm font-medium hover:bg-blue-200">
                      <Wand2 size={16} /> 見積り(徒歩)
                    </button>
                  </div>

                  <div className="flex gap-3 mt-2">
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 mb-1">移動時間(分)</label>
                      <input type="number" min="0" className="w-full p-2 border border-slate-300 rounded-lg outline-none" value={newTravelTime} onChange={(e) => setNewTravelTime(e.target.value)} />
                    </div>
                    <div className="flex-1">
                      <label className="block text-xs text-slate-500 mb-1">滞在時間(分)</label>
                      <input type="number" min="0" className="w-full p-2 border border-slate-300 rounded-lg outline-none" value={newStayTime} onChange={(e) => setNewStayTime(e.target.value)} />
                    </div>
                  </div>

                  <div className="mt-3 p-3 bg-blue-50 border border-blue-100 rounded-lg flex justify-between items-center text-sm">
                    <div className="text-blue-800">
                      <span className="font-semibold text-xs text-blue-600 block mb-0.5">到着予想</span>
                      {previewArrivalTime}
                    </div>
                    <ArrowRight size={16} className="text-blue-300" />
                    <div className="text-blue-800">
                      <span className="font-semibold text-xs text-blue-600 block mb-0.5">出発予想</span>
                      {previewDepartureTime}
                    </div>
                  </div>
                </div>
                <button type="submit" className="w-full bg-slate-800 hover:bg-slate-900 text-white py-2 rounded-lg font-medium">目的地を追加</button>
              </form>
            )}
          </div>

          <div className="bg-white p-5 rounded-xl shadow-sm border border-slate-200 flex-1 overflow-y-auto">
            <h2 className="font-semibold text-slate-800 mb-4">行程表</h2>
            {destinations.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">出発地を設定してください</p>
            ) : (
              <div className="relative border-l-2 border-slate-200 ml-4 pl-6 space-y-6 pb-4">
                {scheduledDestinations.map((dest, index) => (
                  <div key={dest.id} className={`relative p-4 rounded-lg border ${dest.isStart ? 'bg-red-50 border-red-100' : 'bg-slate-50 border-slate-200'} group`}>
                    <div className={`absolute -left-[31px] top-4 w-4 h-4 rounded-full border-4 border-white shadow-sm ${dest.isStart ? 'bg-red-500' : 'bg-blue-500'}`}></div>
                    {!dest.isStart && <div className="text-sm font-bold text-blue-600 mb-1">到着 {dest.arrivalTime}</div>}
                    <div className="flex justify-between items-start">
                      <div className="min-w-0 pr-3">
                        <h3 className="font-bold text-slate-800 text-lg flex flex-wrap items-center gap-2">
                          <span className={`inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white ${dest.isStart ? 'bg-red-500' : 'bg-blue-600'}`}>
                            {index + 1}
                          </span>
                          {dest.isStart && <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded">出発地</span>}
                          {dest.name}
                        </h3>
                        {!dest.isStart && <p className="text-sm text-slate-500 mt-1">滞在: {dest.stayTime}分</p>}
                        <label className="mt-2 inline-flex items-center gap-1.5 text-xs text-slate-500 cursor-pointer select-none">
                          <input
                            type="checkbox"
                            checked={isPlaceVisibleOnMap(dest)}
                            onChange={() => togglePlaceVisibility(dest.id)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-blue-600"
                          />
                          地図に表示
                        </label>
                      </div>
                      <div className="flex shrink-0 items-start gap-2">
                        {placePhotoUrls[dest.name] && (
                          <button
                            type="button"
                            onClick={() => setExpandedPhoto({ url: placePhotoUrls[dest.name], name: dest.name })}
                            className="w-20 h-14 sm:w-24 sm:h-16 overflow-hidden rounded-md border border-slate-200 bg-slate-100 shadow-sm"
                            aria-label={`${dest.name}の写真を拡大`}
                          >
                            <img src={placePhotoUrls[dest.name]} alt={dest.name} className="w-full h-full object-cover" />
                          </button>
                        )}
                        <div className="flex items-center gap-1 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                          {!dest.isStart && (
                            <>
                              <button onClick={() => moveDestination(index, 'up')} disabled={index === 1} className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"><ArrowUp size={18} /></button>
                              <button onClick={() => moveDestination(index, 'down')} disabled={index === destinations.length - 1} className="p-1 text-slate-400 hover:text-slate-800 disabled:opacity-30"><ArrowDown size={18} /></button>
                            </>
                          )}
                          <button onClick={() => removeDestination(dest.id)} className="p-1 text-red-400 hover:text-red-600 ml-1"><Trash2 size={18} /></button>
                        </div>
                      </div>
                    </div>
                    {index < destinations.length - 1 ? (
                      <div className="mt-3 pt-3 border-t border-slate-200 flex justify-between items-start text-sm">
                        <span className="font-medium text-slate-600 mt-1">出発 {dest.departureTime}</span>
                        <div className="flex flex-col items-end gap-1">
                          <span className="flex items-center gap-1 text-slate-600 bg-white px-3 py-1.5 rounded-full border border-slate-300 shadow-sm font-medium">
                            <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: getRouteColor(index) }}></span>
                            {getTravelModeIcon(destinations[index+1].travelMode)} {getTravelModeName(destinations[index+1].travelMode)} {destinations[index+1].travelTime}分
                          </span>
                        </div>
                      </div>
                    ) : (
                      <div className="mt-3 pt-3 border-t border-slate-200 flex justify-start items-center text-sm">
                        <span className="font-medium text-slate-600">出発(終了) {dest.departureTime}</span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        <div className="w-full lg:w-1/2 h-[500px] lg:h-auto bg-slate-200 rounded-xl shadow-inner border border-slate-300 flex flex-col items-center justify-center relative overflow-hidden">
          {renderMapArea()}
        </div>
      </div>

      {logoutConfirm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">ログアウトの確認</h3>
            <p className="text-slate-600 mb-6 text-sm">保存されていないデータは失われます。ログアウトしますか？</p>
            <div className="flex gap-3">
              <button onClick={() => setLogoutConfirm(false)} className="flex-1 bg-slate-200 hover:bg-slate-300 text-slate-800 py-2 rounded-lg font-medium">キャンセル</button>
              <button onClick={() => { setIsLoggedIn(false); setIsAdminMode(false); setLogoutConfirm(false); }} className="flex-1 bg-red-600 hover:bg-red-700 text-white py-2 rounded-lg font-medium">ログアウト</button>
            </div>
          </div>
        </div>
      )}

      {messageBox && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6 text-center">
            <h3 className="text-lg font-bold text-slate-800 mb-2">{messageBox.title}</h3>
            <p className="text-slate-600 mb-6 whitespace-pre-wrap text-sm leading-relaxed">{messageBox.content}</p>
            <button onClick={() => setMessageBox(null)} className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-lg font-medium">確認</button>
          </div>
        </div>
      )}

      {expandedPhoto && (
        <button
          type="button"
          onClick={() => setExpandedPhoto(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-4 cursor-zoom-out"
          aria-label="写真プレビューを閉じる"
        >
          <div className="max-w-4xl w-full">
            <img src={expandedPhoto.url} alt={expandedPhoto.name} className="w-full max-h-[82vh] object-contain rounded-lg shadow-2xl" />
            <div className="mt-3 text-center text-white font-medium">{expandedPhoto.name}</div>
          </div>
        </button>
      )}
    </div>
  );
}
