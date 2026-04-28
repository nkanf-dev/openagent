// Copyright 2026 The OpenAgent Authors. All Rights Reserved.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

import React, {useEffect, useState} from "react";
import {Link, Redirect, Route, Switch, withRouter} from "react-router-dom";
import {Avatar, Button, Card, Drawer, Dropdown, Layout, Menu, Result} from "antd";
import {
  ApartmentOutlined,
  ApiOutlined,
  AppstoreOutlined,
  AuditOutlined,
  BankOutlined,
  BarsOutlined,
  BlockOutlined,
  BranchesOutlined,
  BulbOutlined,
  CloudOutlined,
  CloudServerOutlined,
  CommentOutlined,
  ContainerOutlined,
  DashboardOutlined,
  DatabaseOutlined,
  DeploymentUnitOutlined,
  DesktopOutlined,
  DownOutlined,
  ExperimentOutlined,
  FileOutlined,
  FileSearchOutlined,
  FileTextOutlined,
  FormOutlined,
  FundOutlined,
  GoldOutlined,
  HddOutlined,
  HomeOutlined,
  LineChartOutlined,
  LockOutlined,
  LoginOutlined,
  LogoutOutlined,
  MedicineBoxOutlined,
  MenuFoldOutlined,
  MenuUnfoldOutlined,
  MessageOutlined,
  OrderedListOutlined,
  PictureOutlined,
  PlaySquareOutlined,
  ReadOutlined,
  RiseOutlined,
  SafetyOutlined,
  ScanOutlined,
  SettingOutlined,
  ShareAltOutlined,
  ShopOutlined,
  TeamOutlined,
  ThunderboltOutlined,
  ToolOutlined,
  UnorderedListOutlined,
  UserOutlined,
  VideoCameraOutlined,
  WalletOutlined
} from "@ant-design/icons";
import "./App.less";
import * as Setting from "./Setting";
import AuthCallback from "./AuthCallback";
import * as Conf from "./Conf";
import i18next from "i18next";
import LanguageSelect from "./LanguageSelect";
import ThemeSelect from "./ThemeSelect";
import StoreSelect from "./StoreSelect";
import BreadcrumbBar from "./common/BreadcrumbBar";
import HomePage from "./HomePage";
import StoreListPage from "./StoreListPage";
import StoreEditPage from "./StoreEditPage";
import FileListPage from "./FileListPage";
import FileViewPage from "./FileViewPage";
import FileTreePage from "./FileTreePage";
import VideoListPage from "./VideoListPage";
import VideoEditPage from "./VideoEditPage";
import VideoPage from "./VideoPage";
import PublicVideoListPage from "./basic/PublicVideoListPage";
import ProviderListPage from "./ProviderListPage";
import ProviderEditPage from "./ProviderEditPage";
import VectorListPage from "./VectorListPage";
import VectorEditPage from "./VectorEditPage";
import SigninPage from "./SigninPage";
import AccountPage from "./AccountPage";
import ChatEditPage from "./ChatEditPage";
import ChatListPage from "./ChatListPage";
import MessageListPage from "./MessageListPage";
import MessageEditPage from "./MessageEditPage";
import GraphListPage from "./GraphListPage";
import GraphEditPage from "./GraphEditPage";
import NodeListPage from "./NodeListPage";
import NodeEditPage from "./NodeEditPage";
import MachineListPage from "./MachineListPage";
import MachineEditPage from "./MachineEditPage";
import AssetListPage from "./AssetListPage";
import AssetEditPage from "./AssetEditPage";
import ScanListPage from "./ScanListPage";
import ScanEditPage from "./ScanEditPage";
import ImageListPage from "./ImageListPage";
import ImageEditPage from "./ImageEditPage";
import ContainerListPage from "./ContainerListPage";
import ContainerEditPage from "./ContainerEditPage";
import PodListPage from "./PodListPage";
import PodEditPage from "./PodEditPage";
import SessionListPage from "./SessionListPage";
import ConnectionListPage from "./ConnectionListPage";
import RecordListPage from "./RecordListPage";
import RecordEditPage from "./RecordEditPage";
import WorkflowListPage from "./WorkflowListPage";
import WorkflowEditPage from "./WorkflowEditPage";
import TaskListPage from "./TaskListPage";
import TaskEditPage from "./TaskEditPage";
import ScaleListPage from "./ScaleListPage";
import ScaleEditPage from "./ScaleEditPage";
import FormListPage from "./FormListPage";
import FormEditPage from "./FormEditPage";
import FormDataPage from "./FormDataPage";
import ArticleListPage from "./ArticleListPage";
import ArticleEditPage from "./ArticleEditPage";
import ChatPage from "./ChatPage";
import UsagePage from "./UsagePage";
import ActivityPage from "./ActivityPage";
import NodeWorkbench from "./NodeWorkbench";
import AccessPage from "./component/access/AccessPage";
import AuditPage from "./frame/AuditPage";
import PythonYolov8miPage from "./frame/PythonYolov8miPage";
import PythonSrPage from "./frame/PythonSrPage";
import SystemInfo from "./SystemInfo";
import OsDesktop from "./OsDesktop";
import TemplateListPage from "./TemplateListPage";
import TemplateEditPage from "./TemplateEditPage";
import ApplicationListPage from "./ApplicationListPage";
import ApplicationEditPage from "./ApplicationEditPage";
import ApplicationStorePage from "./ApplicationStorePage";
import ApplicationDetailsPage from "./ApplicationViewPage";
import HospitalListPage from "./HospitalListPage";
import HospitalEditPage from "./HospitalEditPage";
import DoctorListPage from "./DoctorListPage";
import DoctorEditPage from "./DoctorEditPage";
import PatientListPage from "./PatientListPage";
import PatientEditPage from "./PatientEditPage";
import CaaseListPage from "./CaaseListPage";
import CaaseEditPage from "./CaaseEditPage";
import ConsultationListPage from "./ConsultationListPage";
import ConsultationEditPage from "./ConsultationEditPage";

const {Header, Footer, Content, Sider} = Layout;

function getMenuParentKey(uri) {
  if (!uri) {return null;}
  if (uri.includes("/chats") || uri.includes("/messages")) {return "/ai-chat";}
  if (uri.includes("/chat") || uri.includes("/usages") || uri.includes("/activities") || uri.includes("/desktop")) {return "/home";}
  if (uri.includes("/stores") || uri.includes("/files") || uri.includes("/providers") || uri.includes("/vectors")) {return "/ai-setting";}
  if (uri.includes("/templates") || uri.includes("/application-store") || uri.includes("/applications") || uri.includes("/nodes") || uri.includes("/machines") || uri.includes("/assets") || uri.includes("/images") || uri.includes("/containers") || uri.includes("/pods") || uri.includes("/workbench")) {return "/cloud";}
  if (uri.includes("/videos") || uri.includes("/public-videos") || uri.includes("/tasks") || uri.includes("/scales") || uri.includes("/forms") || uri.includes("/workflows") || uri.includes("/hospitals") || uri.includes("/doctors") || uri.includes("/patients") || uri.includes("/caases") || uri.includes("/consultations") || uri.includes("/audit") || uri.includes("/yolov8mi") || uri.includes("/sr") || uri.includes("/articles") || uri.includes("/graphs") || uri.includes("/scans")) {return "/multimedia";}
  if (uri.includes("/sessions") || uri.includes("/connections") || uri.includes("/records")) {return "/logs";}
  if (uri.includes("/users") || uri.includes("/resources") || uri.includes("/permissions")) {return "/identity";}
  if (uri.includes("/sysinfo") || uri.includes("/swagger")) {return "/admin";}
  return null;
}

function ManagementPage(props) {
  const [menuVisible, setMenuVisible] = useState(false);
  const [siderCollapsed, setSiderCollapsed] = useState(() => localStorage.getItem("siderCollapsed") === "true");
  const [menuOpenKeys, setMenuOpenKeys] = useState(() => {
    if (localStorage.getItem("siderCollapsed") === "true") {
      return [];
    }
    const parentKey = getMenuParentKey(props.uri || location.pathname);
    return parentKey ? [parentKey] : [];
  });

  useEffect(() => {
    if (siderCollapsed) {
      setMenuOpenKeys([]);
      return;
    }
    const parentKey = getMenuParentKey(props.uri);
    if (parentKey) {
      setMenuOpenKeys(prev =>
        prev.includes(parentKey) ? prev : [...prev, parentKey]
      );
    }
  }, [props.uri, siderCollapsed]);
  const {
    account,
    store,
    forms,
    themeAlgorithm,
    logo,
    uri,
    setLogoAndThemeAlgorithm,
    signout,
    onMenuClick,
    history,
  } = props;

  const currentUri = uri || location.pathname;
  const selectedLeafKey = "/" + (currentUri.split("/").filter(Boolean)[0] || "");

  const isDark = themeAlgorithm.includes("dark");
  const textColor = isDark ? "white" : "black";
  const siderLogo = logo || Setting.getLogo(themeAlgorithm, store?.logoUrl);

  const toggleSider = () => {
    const next = !siderCollapsed;
    setSiderCollapsed(next);
    localStorage.setItem("siderCollapsed", String(next));
  };

  const onClose = () => setMenuVisible(false);
  const showMenu = () => setMenuVisible(true);

  function isStoreSelectEnabled() {
    const currentUri = uri || window.location.pathname;
    if (currentUri.includes("/chat")) {
      return true;
    }
    const enabledStartsWith = ["/stores", "/providers", "/vectors", "/chats", "/messages", "/usages", "/files"];
    if (enabledStartsWith.some(prefix => currentUri.startsWith(prefix))) {
      return true;
    }
    if (currentUri === "/" || currentUri === "/home") {
      if (
        Setting.isAnonymousUser(account) ||
        Setting.isChatUser(account) ||
        Setting.isAdminUser(account) ||
        Setting.isChatAdminUser(account) ||
        Setting.getUrlParam("isRaw") !== null
      ) {
        return true;
      }
    }
    return false;
  }

  function renderAvatar() {
    if (account.avatar === "") {
      return (
        <Avatar style={{backgroundColor: Setting.getAvatarColor(account.name), verticalAlign: "middle", marginLeft: 8}} size="large">
          {Setting.getShortName(account.name)}
        </Avatar>
      );
    } else {
      return (
        <Avatar src={account.avatar} style={{verticalAlign: "middle", marginLeft: 8}} size="large">
          {Setting.getShortName(account.name)}
        </Avatar>
      );
    }
  }

  function renderRightDropdown() {
    if ((Setting.isAnonymousUser(account) && Conf.DisablePreviewMode) || Setting.getUrlParam("isRaw") !== null) {
      return (
        <div className="rightDropDown select-box">
          {renderAvatar()}
          &nbsp;
          &nbsp;
          {Setting.isMobile() ? null : Setting.getShortName(account.displayName)} &nbsp; <DownOutlined />
          &nbsp;
          &nbsp;
          &nbsp;
        </div>
      );
    }

    const items = [];
    if (!Setting.isAnonymousUser(account)) {
      items.push(Setting.getItem(<><SettingOutlined />&nbsp;&nbsp;{i18next.t("account:My Account")}</>, "/account"));
      items.push(Setting.getItem(<><LogoutOutlined />&nbsp;&nbsp;{i18next.t("account:Sign Out")}</>, "/logout"));
    } else {
      items.push(Setting.getItem(<><LoginOutlined />&nbsp;&nbsp;{i18next.t("account:Sign In")}</>, "/login"));
    }

    const onClick = (e) => {
      if (e.key === "/account") {
        if (Setting.isBasicUser(account)) {
          history.push("/account");
        } else {
          Setting.openLink(Setting.getMyProfileUrl(account));
        }
      } else if (e.key === "/logout") {
        signout();
      } else if (e.key === "/login") {
        if (Setting.getSigninUrl() !== "") {
          history.push(window.location.pathname);
          Setting.redirectToLogin();
        } else {
          sessionStorage.setItem("from", window.location.pathname);
          history.push("/signin");
        }
      }
    };

    return (
      <Dropdown key="/rightDropDown" menu={{items, onClick}}>
        <div className="rightDropDown">
          {renderAvatar()}
          &nbsp;
          &nbsp;
          {Setting.isMobile() ? null : Setting.getShortName(account.displayName)} &nbsp; <DownOutlined />
          &nbsp;
          &nbsp;
          &nbsp;
        </div>
      </Dropdown>
    );
  }

  function renderAccountMenu() {
    if (account === undefined) {
      return null;
    } else if (account === null) {
      return (
        <React.Fragment>
          {Setting.getSignupUrl() !== "" ? (
            <div key="/signup" style={{float: "right", marginRight: "20px"}}>
              <a href={Setting.getSignupUrl()}>{i18next.t("account:Sign Up")}</a>
            </div>
          ) : null}
          <div key="/signin" style={{float: "right", marginRight: "20px"}}>
            <a href={Setting.getSigninUrl() || "/signin"}>{i18next.t("account:Sign In")}</a>
          </div>
          <div className="select-box" style={{float: "right", margin: "0px", padding: "0px"}}>
            <ThemeSelect themeAlgorithm={themeAlgorithm} onChange={setLogoAndThemeAlgorithm} />
          </div>
          <div className="select-box" style={{float: "right", margin: "0px", padding: "0px"}}>
            <LanguageSelect />
          </div>
        </React.Fragment>
      );
    } else {
      return (
        <React.Fragment>
          {renderRightDropdown()}
          <ThemeSelect className="select-box" themeAlgorithm={themeAlgorithm} onChange={setLogoAndThemeAlgorithm} />
          <LanguageSelect className="select-box" />
          {Setting.isLocalAdminUser(account) &&
            <StoreSelect
              account={account}
              className="store-select"
              withAll={true}
              style={{display: Setting.isMobile() ? "none" : "flex"}}
              disabled={!isStoreSelectEnabled()}
            />
          }
          <div className="select-box" style={{float: "right", marginRight: "20px", padding: "0px"}}>
            <div dangerouslySetInnerHTML={{__html: Conf.NavbarHtml}} />
          </div>
        </React.Fragment>
      );
    }
  }

  function filterMenuItems(menuItems, navItems) {
    if (!navItems || navItems.includes("all")) {
      return menuItems;
    }

    const filteredItems = menuItems.map(item => {
      if (!Array.isArray(item.children)) {
        return item;
      }
      const filteredChildren = item.children.filter(child => navItems.includes(child.key));
      const newItem = {...item};
      newItem.children = filteredChildren;
      return newItem;
    });

    return filteredItems.filter(item => !Array.isArray(item.children) || item.children.length > 0);
  }

  function filterUserMenuItems(menuItems) {
    if (!Setting.isBasicUser(account)) {
      return menuItems;
    }
    return menuItems.filter(item => !["/identity", "#", "##", "###"].includes(item.key));
  }

  function getMenuItems() {
    const res = [];

    res.push(Setting.getItem(<Link to="/">{i18next.t("general:Home")}</Link>, "/", <HomeOutlined />));

    if (account === null || account === undefined) {
      return [];
    }

    const navItems = store?.navItems;

    if (account.type.startsWith("video-")) {
      res.push(Setting.getItem(<Link to="/videos">{i18next.t("general:Videos")}</Link>, "/videos", <VideoCameraOutlined />));

      if (account.type === "video-admin-user") {
        res.push(Setting.getItem(
          <a target="_blank" rel="noreferrer" href={Setting.getMyProfileUrl(account).replace("/account", "/users")}>
            {i18next.t("general:Users")}
            {Setting.renderExternalLink()}
          </a>,
          "#",
          <UserOutlined />));
      }

      return res;
    }

    if (!Setting.isAdminUser(account) && (Setting.isAnonymousUser(account) && !Conf.DisablePreviewMode)) {
      if (!Setting.isChatAdminUser(account)) {
        return res;
      }
    }

    const domain = Setting.getSubdomain();

    if (Conf.ShortcutPageItems.length > 0 && domain === "data") {
      res.push(Setting.getItem(<Link to="/stores">{i18next.t("general:Stores")}</Link>, "/stores", <AppstoreOutlined />));
      res.push(Setting.getItem(<Link to="/providers">{i18next.t("general:Providers")}</Link>, "/providers", <ThunderboltOutlined />));
      res.push(Setting.getItem(<Link to="/nodes">{i18next.t("general:Nodes")}</Link>, "/nodes", <CloudServerOutlined />));
      res.push(Setting.getItem(<Link to="/sessions">{i18next.t("general:Sessions")}</Link>, "/sessions", <OrderedListOutlined />));
      res.push(Setting.getItem(<Link to="/connections">{i18next.t("general:Connections")}</Link>, "/connections", <ApiOutlined />));
      res.push(Setting.getItem(<Link to="/records">{i18next.t("general:Records")}</Link>, "/records", <DatabaseOutlined />));
    } else if (Conf.ShortcutPageItems.length > 0 && domain === "ai") {
      res.push(Setting.getItem(<Link to="/chat">{i18next.t("general:Chat")}</Link>, "/chat", <CommentOutlined />));
      res.push(Setting.getItem(<Link to="/stores">{i18next.t("general:Stores")}</Link>, "/stores", <AppstoreOutlined />));
      res.push(Setting.getItem(<Link to="/providers">{i18next.t("general:Providers")}</Link>, "/providers", <ThunderboltOutlined />));
      res.push(Setting.getItem(<Link to="/vectors">{i18next.t("general:Vectors")}</Link>, "/vectors", <ApartmentOutlined />));
      res.push(Setting.getItem(<Link to="/chats">{i18next.t("general:Chats")}</Link>, "/chats", <BulbOutlined />));
      res.push(Setting.getItem(<Link to="/messages">{i18next.t("general:Messages")}</Link>, "/messages", <MessageOutlined />));
      res.push(Setting.getItem(<Link to="/usages">{i18next.t("general:Usages")}</Link>, "/usages", <LineChartOutlined />));
      if (Setting.isAdminUser(account)) {
        res.push(Setting.getItem(<Link to="/activities">{i18next.t("general:Activities")}</Link>, "/activities", <DashboardOutlined />));
      }
    } else if (Setting.isChatAdminUser(account)) {
      res.push(Setting.getItem(<Link to="/chat">{i18next.t("general:Chat")}</Link>, "/chat", <CommentOutlined />));
      res.push(Setting.getItem(<Link to="/stores">{i18next.t("general:Stores")}</Link>, "/stores", <AppstoreOutlined />));
      res.push(Setting.getItem(<Link to="/vectors">{i18next.t("general:Vectors")}</Link>, "/vectors", <ApartmentOutlined />));
      res.push(Setting.getItem(<Link to="/chats">{i18next.t("general:Chats")}</Link>, "/chats", <BulbOutlined />));
      res.push(Setting.getItem(<Link to="/messages">{i18next.t("general:Messages")}</Link>, "/messages", <MessageOutlined />));
      res.push(Setting.getItem(<Link to="/usages">{i18next.t("general:Usages")}</Link>, "/usages", <LineChartOutlined />));
      if (Setting.isAdminUser(account)) {
        res.push(Setting.getItem(<Link to="/activities">{i18next.t("general:Activities")}</Link>, "/activities", <DashboardOutlined />));
      }

      if (window.location.pathname === "/") {
        Setting.goToLinkSoft({props}, "/chat");
      }

      res.push(Setting.getItem(
        <a target="_blank" rel="noreferrer" href={Setting.getMyProfileUrl(account).replace("/account", "/users")}>
          {i18next.t("general:Users")}
          {Setting.renderExternalLink()}
        </a>,
        "#",
        <UserOutlined />));

      res.push(Setting.getItem(
        <a target="_blank" rel="noreferrer" href={Setting.getMyProfileUrl(account).replace("/account", "/resources")}>
          {i18next.t("general:Resources")}
          {Setting.renderExternalLink()}
        </a>,
        "##",
        <TeamOutlined />));

      res.push(Setting.getItem(
        <a target="_blank" rel="noreferrer" href={Setting.getMyProfileUrl(account).replace("/account", "/permissions")}>
          {i18next.t("general:Permissions")}
          {Setting.renderExternalLink()}
        </a>,
        "###",
        <SafetyOutlined />));
    } else if (Setting.isTaskUser(account)) {
      res.push(Setting.getItem(<Link to="/tasks">{i18next.t("general:Tasks")}</Link>, "/tasks", <UnorderedListOutlined />));
      if (Setting.isAdminUser(account)) {
        res.push(Setting.getItem(<Link to="/scales">{i18next.t("general:Scales")}</Link>, "/scales", <FundOutlined />));
      }

      if (window.location.pathname === "/") {
        Setting.goToLinkSoft({props}, "/tasks");
      }
    } else if (Conf.ShortcutPageItems.length > 0 && domain === "video") {
      if (Conf.EnableExtraPages) {
        res.push(Setting.getItem(<Link to="/videos">{i18next.t("general:Videos")}</Link>, "/videos", <VideoCameraOutlined />));
      }

      if (window.location.pathname === "/") {
        Setting.goToLinkSoft({props}, "/videos");
      }
    } else if (!Setting.isAdminUser(account) && !Setting.isChatAdminUser(account)) {
      res.push(Setting.getItem(<Link to="/chat">{i18next.t("general:Chat")}</Link>, "/chat", <CommentOutlined />));

      if (window.location.pathname === "/") {
        Setting.goToLinkSoft({props}, "/chat");
      }

      return res;
    } else {
      res.pop();

      res.push(Setting.getItem(<Link style={{color: textColor}} to="/chat">{i18next.t("general:Home")}</Link>, "/home", <HomeOutlined />, [
        Setting.getItem(<Link to="/chat">{i18next.t("general:Chat")}</Link>, "/chat", <CommentOutlined />),
        Setting.getItem(<Link to="/usages">{i18next.t("general:Usages")}</Link>, "/usages", <LineChartOutlined />),
        Setting.getItem(<Link to="/activities">{i18next.t("general:Activities")}</Link>, "/activities", <DashboardOutlined />),
        Setting.getItem(<Link to="/desktop">{i18next.t("general:OS Desktop")}</Link>, "/desktop", <DesktopOutlined />),
      ]));

      res.push(Setting.getItem(<Link style={{color: textColor}} to="/chats">{i18next.t("general:Chats & Messages")}</Link>, "/ai-chat", <BulbOutlined />, [
        Setting.getItem(<Link to="/chats">{i18next.t("general:Chats")}</Link>, "/chats", <OrderedListOutlined />),
        Setting.getItem(<Link to="/messages">{i18next.t("general:Messages")}</Link>, "/messages", <MessageOutlined />),
      ]));

      res.push(Setting.getItem(<Link style={{color: textColor}} to="/stores">{i18next.t("general:AI Setting")}</Link>, "/ai-setting", <AppstoreOutlined />, [
        Setting.getItem(<Link to="/stores">{i18next.t("general:Stores")}</Link>, "/stores", <AppstoreOutlined />),
        Setting.getItem(<Link to="/files">{i18next.t("general:Files")}</Link>, "/files", <FileOutlined />),
        Setting.getItem(<Link to="/providers">{i18next.t("general:Providers")}</Link>, "/providers", <ThunderboltOutlined />),
        Setting.getItem(<Link to="/vectors">{i18next.t("general:Vectors")}</Link>, "/vectors", <ApartmentOutlined />),
      ]));

      res.push(Setting.getItem(<Link style={{color: textColor}} to="/nodes">{i18next.t("general:Cloud")}</Link>, "/cloud", <CloudOutlined />, [
        Setting.getItem(<Link to="/templates">{i18next.t("general:Templates")}</Link>, "/templates", <FileTextOutlined />),
        Setting.getItem(<Link to="/application-store">{i18next.t("general:Application Store")}</Link>, "/application-store", <ShopOutlined />),
        Setting.getItem(<Link to="/applications">{i18next.t("general:Applications")}</Link>, "/applications", <DeploymentUnitOutlined />),
        Setting.getItem(<Link to="/nodes">{i18next.t("general:Nodes")}</Link>, "/nodes", <CloudServerOutlined />),
        Setting.getItem(<Link to="/machines">{i18next.t("general:Machines")}</Link>, "/machines", <HddOutlined />),
        Setting.getItem(<Link to="/assets">{i18next.t("general:Assets")}</Link>, "/assets", <GoldOutlined />),
        Setting.getItem(<Link to="/images">{i18next.t("general:Images")}</Link>, "/images", <PictureOutlined />),
        Setting.getItem(<Link to="/containers">{i18next.t("general:Containers")}</Link>, "/containers", <ContainerOutlined />),
        Setting.getItem(<Link to="/pods">{i18next.t("general:Pods")}</Link>, "/pods", <BlockOutlined />),
        Setting.getItem(<Link to="/workbench" target="_blank">{i18next.t("general:Workbench")}</Link>, "workbench", <ToolOutlined />),
      ]));

      res.push(Setting.getItem(<Link style={{color: textColor}} to="/videos">{i18next.t("general:Multimedia")}</Link>, "/multimedia", <VideoCameraOutlined />, [
        Setting.getItem(<Link to="/videos">{i18next.t("general:Videos")}</Link>, "/videos", <VideoCameraOutlined />),
        Setting.getItem(<Link to="/public-videos">{i18next.t("general:Public Videos")}</Link>, "/public-videos", <PlaySquareOutlined />),
        Setting.getItem(<Link to="/tasks">{i18next.t("general:Tasks")}</Link>, "/tasks", <UnorderedListOutlined />),
        Setting.getItem(<Link to="/scales">{i18next.t("general:Scales")}</Link>, "/scales", <FundOutlined />),
        Setting.getItem(<Link to="/forms">{i18next.t("general:Forms")}</Link>, "/forms", <FormOutlined />),
        Setting.getItem(<Link to="/workflows">{i18next.t("general:Workflows")}</Link>, "/workflows", <BranchesOutlined />),
        Setting.getItem(<Link to="/hospitals">{i18next.t("med:Hospitals")}</Link>, "/hospitals", <BankOutlined />),
        Setting.getItem(<Link to="/doctors">{i18next.t("med:Doctors")}</Link>, "/doctors", <MedicineBoxOutlined />),
        Setting.getItem(<Link to="/patients">{i18next.t("med:Patients")}</Link>, "/patients", <UserOutlined />),
        Setting.getItem(<Link to="/caases">{i18next.t("med:Caases")}</Link>, "/caases", <FileSearchOutlined />),
        Setting.getItem(<Link to="/consultations">{i18next.t("med:Consultations")}</Link>, "/consultations", <TeamOutlined />),
        Setting.getItem(<Link to="/audit">{i18next.t("general:Audit")}</Link>, "/audit", <AuditOutlined />),
        Setting.getItem(<Link to="/yolov8mi">{i18next.t("med:Medical Image Analysis")}</Link>, "/yolov8mi", <ExperimentOutlined />),
        Setting.getItem(<Link to="/sr">{i18next.t("med:Super Resolution")}</Link>, "/sr", <RiseOutlined />),
        Setting.getItem(<Link to="/articles">{i18next.t("general:Articles")}</Link>, "/articles", <ReadOutlined />),
        Setting.getItem(<Link to="/graphs">{i18next.t("general:Graphs")}</Link>, "/graphs", <ShareAltOutlined />),
        Setting.getItem(<Link to="/scans">{i18next.t("general:Scans")}</Link>, "/scans", <ScanOutlined />),
      ]));

      res.push(Setting.getItem(<Link style={{color: textColor}} to="/sessions">{i18next.t("general:Logging")}</Link>, "/logs", <WalletOutlined />, [
        Setting.getItem(<Link to="/sessions">{i18next.t("general:Sessions")}</Link>, "/sessions", <OrderedListOutlined />),
        Setting.getItem(<Link to="/connections">{i18next.t("general:Connections")}</Link>, "/connections", <ApiOutlined />),
        Setting.getItem(<Link to="/records">{i18next.t("general:Records")}</Link>, "/records", <DatabaseOutlined />),
      ]));

      res.push(Setting.getItem(<Link style={{color: textColor}} to="#">{i18next.t("general:Identity")}</Link>, "/identity", <LockOutlined />, [
        Setting.getItem(
          <a target="_blank" rel="noreferrer" href={Setting.getMyProfileUrl(account).replace("/account", "/users")}>
            {i18next.t("general:Users")}
            {Setting.renderExternalLink()}
          </a>, "/users", <UserOutlined />),
        Setting.getItem(
          <a target="_blank" rel="noreferrer" href={Setting.getMyProfileUrl(account).replace("/account", "/resources")}>
            {i18next.t("general:Resources")}
            {Setting.renderExternalLink()}
          </a>, "/resources", <TeamOutlined />),
        Setting.getItem(
          <a target="_blank" rel="noreferrer" href={Setting.getMyProfileUrl(account).replace("/account", "/permissions")}>
            {i18next.t("general:Permissions")}
            {Setting.renderExternalLink()}
          </a>, "/permissions", <SafetyOutlined />),
      ]));

      res.push(Setting.getItem(<Link style={{color: textColor}} to="/sysinfo">{i18next.t("general:Admin")}</Link>, "/admin", <SettingOutlined />, [
        Setting.getItem(<Link to="/sysinfo">{i18next.t("general:System Info")}</Link>, "/sysinfo", <DashboardOutlined />),
        Setting.getItem(
          <a target="_blank" rel="noreferrer" href={Setting.isLocalhost() ? `${Setting.ServerUrl}/swagger/index.html` : "/swagger/index.html"}>
            {i18next.t("general:Swagger")}
            {Setting.renderExternalLink()}
          </a>, "/swagger", <ApiOutlined />),
      ]));

      return Setting.isBasicUser(account) ? filterMenuItems(filterUserMenuItems(res), navItems) : filterMenuItems(res, navItems);
    }

    const sortedForms = forms.slice().sort((a, b) => a.position.localeCompare(b.position));
    sortedForms.forEach(form => {
      const path = `/forms/${form.name}/data`;
      res.push(Setting.getItem(<Link to={path}>{form.displayName}</Link>, path, <FormOutlined />));
    });

    return Setting.isBasicUser(account) ? filterUserMenuItems(res) : res;
  }

  function renderHomeIfSignedIn(component) {
    if (account !== null && account !== undefined) {
      return <Redirect to="/" />;
    } else {
      return component;
    }
  }

  function renderSigninIfNotSignedIn(component) {
    if (account === null) {
      const signinUrl = Setting.getSigninUrl();
      if (signinUrl && signinUrl !== "") {
        sessionStorage.setItem("from", window.location.pathname);
        window.location.replace(signinUrl);
      } else {
        return null;
      }
    } else if (account === undefined) {
      return null;
    } else {
      return component;
    }
  }

  function renderRouter() {
    if (account?.type.startsWith("video-")) {
      if (window.location.pathname === "/") {
        return <PublicVideoListPage account={account} />;
      }
    }

    return (
      <Switch>
        <Route exact path="/access/:owner/:name" render={(props) => renderSigninIfNotSignedIn(<AccessPage account={account} {...props} />)} />
        <Route exact path="/callback" component={AuthCallback} />
        <Route exact path="/account" render={(props) => renderSigninIfNotSignedIn(Setting.isBasicUser(account) ? <AccountPage account={account} {...props} /> : <Redirect to="/" />)} />
        <Route exact path="/signin" render={(props) => Setting.isAnonymousUser(account) ? <SigninPage logo={siderLogo} {...props} /> : renderHomeIfSignedIn(<SigninPage logo={siderLogo} {...props} />)} />
        <Route exact path="/" render={(props) => renderSigninIfNotSignedIn(<HomePage account={account} {...props} />)} />
        <Route exact path="/home" render={(props) => renderSigninIfNotSignedIn(<HomePage account={account} {...props} />)} />
        <Route exact path="/stores" render={(props) => renderSigninIfNotSignedIn(<StoreListPage account={account} {...props} />)} />
        <Route exact path="/stores/:owner/:storeName" render={(props) => renderSigninIfNotSignedIn(<StoreEditPage account={account} {...props} />)} />
        <Route exact path="/stores/:owner/:storeName/view" render={(props) => renderSigninIfNotSignedIn(<FileTreePage account={account} {...props} />)} />
        <Route exact path="/stores/:owner/:storeName/chats" render={(props) => renderSigninIfNotSignedIn(<ChatListPage account={account} {...props} />)} />
        <Route exact path="/stores/:owner/:storeName/messages" render={(props) => renderSigninIfNotSignedIn(<MessageListPage account={account} {...props} />)} />
        <Route exact path="/stores/:owner/:storeName/vectors" render={(props) => renderSigninIfNotSignedIn(<VectorListPage account={account} {...props} />)} />
        <Route exact path="/videos" render={(props) => renderSigninIfNotSignedIn(<VideoListPage account={account} {...props} />)} />
        <Route exact path="/videos/:owner/:videoName" render={(props) => renderSigninIfNotSignedIn(<VideoEditPage account={account} {...props} />)} />
        <Route exact path="/public-videos" render={(props) => <PublicVideoListPage {...props} />} />
        <Route exact path="/public-videos/:owner/:videoName" render={(props) => <VideoPage account={account} {...props} />} />
        <Route exact path="/providers" render={(props) => renderSigninIfNotSignedIn(<ProviderListPage account={account} {...props} />)} />
        <Route exact path="/providers/:providerName" render={(props) => renderSigninIfNotSignedIn(<ProviderEditPage account={account} {...props} />)} />
        <Route exact path="/files" render={(props) => renderSigninIfNotSignedIn(<FileListPage account={account} {...props} />)} />
        <Route exact path="/files/:fileName" render={(props) => renderSigninIfNotSignedIn(<FileViewPage account={account} {...props} />)} />
        <Route exact path="/vectors" render={(props) => renderSigninIfNotSignedIn(<VectorListPage account={account} {...props} />)} />
        <Route exact path="/vectors/:vectorName" render={(props) => renderSigninIfNotSignedIn(<VectorEditPage account={account} {...props} />)} />
        <Route exact path="/chats" render={(props) => renderSigninIfNotSignedIn(<ChatListPage account={account} {...props} />)} />
        <Route exact path="/chats/:chatName" render={(props) => renderSigninIfNotSignedIn(<ChatEditPage account={account} {...props} />)} />
        <Route exact path="/messages" render={(props) => renderSigninIfNotSignedIn(<MessageListPage account={account} {...props} />)} />
        <Route exact path="/messages/:messageName" render={(props) => renderSigninIfNotSignedIn(<MessageEditPage account={account} {...props} />)} />
        <Route exact path="/usages" render={(props) => renderSigninIfNotSignedIn(<UsagePage account={account} themeAlgorithm={themeAlgorithm} {...props} />)} />
        <Route exact path="/activities" render={(props) => renderSigninIfNotSignedIn(<ActivityPage account={account} themeAlgorithm={themeAlgorithm} {...props} />)} />
        <Route exact path="/desktop" render={(props) => <OsDesktop account={account} {...props} />} />
        <Route exact path="/templates" render={(props) => renderSigninIfNotSignedIn(<TemplateListPage account={account} {...props} />)} />
        <Route exact path="/templates/:templateName" render={(props) => renderSigninIfNotSignedIn(<TemplateEditPage account={account} {...props} />)} />
        <Route exact path="/applications" render={(props) => renderSigninIfNotSignedIn(<ApplicationListPage account={account} {...props} />)} />
        <Route exact path="/applications/:applicationName" render={(props) => renderSigninIfNotSignedIn(<ApplicationEditPage account={account} {...props} />)} />
        <Route exact path="/applications/:applicationName/view" render={(props) => renderSigninIfNotSignedIn(<ApplicationDetailsPage account={account} {...props} />)} />
        <Route exact path="/application-store" render={(props) => renderSigninIfNotSignedIn(<ApplicationStorePage account={account} {...props} />)} />
        <Route exact path="/nodes" render={(props) => renderSigninIfNotSignedIn(<NodeListPage account={account} {...props} />)} />
        <Route exact path="/nodes/:nodeName" render={(props) => renderSigninIfNotSignedIn(<NodeEditPage account={account} {...props} />)} />
        <Route exact path="/sessions" render={(props) => renderSigninIfNotSignedIn(<SessionListPage account={account} {...props} />)} />
        <Route exact path="/connections" render={(props) => renderSigninIfNotSignedIn(<ConnectionListPage account={account} {...props} />)} />
        <Route exact path="/records" render={(props) => renderSigninIfNotSignedIn(<RecordListPage account={account} {...props} />)} />
        <Route exact path="/records/:organizationName/:recordName" render={(props) => renderSigninIfNotSignedIn(<RecordEditPage account={account} {...props} />)} />
        <Route exact path="/workbench" render={(props) => renderSigninIfNotSignedIn(<NodeWorkbench account={account} {...props} />)} />
        <Route exact path="/machines" render={(props) => renderSigninIfNotSignedIn(<MachineListPage account={account} {...props} />)} />
        <Route exact path="/machines/:organizationName/:machineName" render={(props) => renderSigninIfNotSignedIn(<MachineEditPage account={account} {...props} />)} />
        <Route exact path="/assets" render={(props) => renderSigninIfNotSignedIn(<AssetListPage account={account} {...props} />)} />
        <Route exact path="/assets/:assetName" render={(props) => renderSigninIfNotSignedIn(<AssetEditPage account={account} {...props} />)} />
        <Route exact path="/scans" render={(props) => renderSigninIfNotSignedIn(<ScanListPage account={account} {...props} />)} />
        <Route exact path="/scans/:scanName" render={(props) => renderSigninIfNotSignedIn(<ScanEditPage account={account} {...props} />)} />
        <Route exact path="/images" render={(props) => renderSigninIfNotSignedIn(<ImageListPage account={account} {...props} />)} />
        <Route exact path="/images/:organizationName/:imageName" render={(props) => renderSigninIfNotSignedIn(<ImageEditPage account={account} {...props} />)} />
        <Route exact path="/containers" render={(props) => renderSigninIfNotSignedIn(<ContainerListPage account={account} {...props} />)} />
        <Route exact path="/containers/:organizationName/:containerName" render={(props) => renderSigninIfNotSignedIn(<ContainerEditPage account={account} {...props} />)} />
        <Route exact path="/pods" render={(props) => renderSigninIfNotSignedIn(<PodListPage account={account} {...props} />)} />
        <Route exact path="/pods/:organizationName/:podName" render={(props) => renderSigninIfNotSignedIn(<PodEditPage account={account} {...props} />)} />
        <Route exact path="/workflows" render={(props) => renderSigninIfNotSignedIn(<WorkflowListPage account={account} {...props} />)} />
        <Route exact path="/workflows/:workflowName" render={(props) => renderSigninIfNotSignedIn(<WorkflowEditPage account={account} {...props} />)} />
        <Route exact path="/audit" render={(props) => renderSigninIfNotSignedIn(<AuditPage account={account} {...props} />)} />
        <Route exact path="/yolov8mi" render={(props) => renderSigninIfNotSignedIn(<PythonYolov8miPage account={account} {...props} />)} />
        <Route exact path="/sr" render={(props) => renderSigninIfNotSignedIn(<PythonSrPage account={account} {...props} />)} />
        <Route exact path="/tasks" render={(props) => renderSigninIfNotSignedIn(<TaskListPage account={account} {...props} />)} />
        <Route exact path="/tasks/:owner/:taskName" render={(props) => renderSigninIfNotSignedIn(<TaskEditPage account={account} {...props} />)} />
        <Route exact path="/scales" render={(props) => renderSigninIfNotSignedIn(<ScaleListPage account={account} {...props} />)} />
        <Route exact path="/scales/:owner/:scaleName" render={(props) => renderSigninIfNotSignedIn(<ScaleEditPage account={account} {...props} />)} />
        <Route exact path="/forms" render={(props) => renderSigninIfNotSignedIn(<FormListPage account={account} {...props} />)} />
        <Route exact path="/forms/:formName" render={(props) => renderSigninIfNotSignedIn(<FormEditPage account={account} {...props} />)} />
        <Route exact path="/forms/:formName/data" render={(props) => renderSigninIfNotSignedIn(<FormDataPage key={props.match.params.formName} account={account} {...props} />)} />
        <Route exact path="/articles" render={(props) => renderSigninIfNotSignedIn(<ArticleListPage account={account} {...props} />)} />
        <Route exact path="/articles/:articleName" render={(props) => renderSigninIfNotSignedIn(<ArticleEditPage account={account} {...props} />)} />
        <Route exact path="/hospitals" render={(props) => renderSigninIfNotSignedIn(<HospitalListPage account={account} {...props} />)} />
        <Route exact path="/hospitals/:hospitalName" render={(props) => renderSigninIfNotSignedIn(<HospitalEditPage account={account} {...props} />)} />
        <Route exact path="/doctors" render={(props) => renderSigninIfNotSignedIn(<DoctorListPage account={account} {...props} />)} />
        <Route exact path="/doctors/:doctorName" render={(props) => renderSigninIfNotSignedIn(<DoctorEditPage account={account} {...props} />)} />
        <Route exact path="/patients" render={(props) => renderSigninIfNotSignedIn(<PatientListPage account={account} {...props} />)} />
        <Route exact path="/patients/:patientName" render={(props) => renderSigninIfNotSignedIn(<PatientEditPage account={account} {...props} />)} />
        <Route exact path="/caases" render={(props) => renderSigninIfNotSignedIn(<CaaseListPage account={account} {...props} />)} />
        <Route exact path="/caases/:caaseName" render={(props) => renderSigninIfNotSignedIn(<CaaseEditPage account={account} {...props} />)} />
        <Route exact path="/consultations" render={(props) => renderSigninIfNotSignedIn(<ConsultationListPage account={account} {...props} />)} />
        <Route exact path="/consultations/:consultationName" render={(props) => renderSigninIfNotSignedIn(<ConsultationEditPage account={account} {...props} />)} />
        <Route exact path="/chat" render={(props) => renderSigninIfNotSignedIn(<ChatPage account={account} {...props} />)} />
        <Route exact path="/chat/:chatName" render={(props) => renderSigninIfNotSignedIn(<ChatPage account={account} {...props} />)} />
        <Route exact path="/stores/:owner/:storeName/chat" render={(props) => renderSigninIfNotSignedIn(<ChatPage account={account} {...props} />)} />
        <Route exact path="/:owner/:storeName/chat" render={(props) => renderSigninIfNotSignedIn(<ChatPage account={account} {...props} />)} />
        <Route exact path="/:owner/:storeName/chat/:chatName" render={(props) => renderSigninIfNotSignedIn(<ChatPage account={account} {...props} />)} />
        <Route exact path="/graphs" render={(props) => renderSigninIfNotSignedIn(<GraphListPage account={account} {...props} />)} />
        <Route exact path="/graphs/:graphName" render={(props) => renderSigninIfNotSignedIn(<GraphEditPage account={account} {...props} />)} />
        <Route exact path="/sysinfo" render={(props) => renderSigninIfNotSignedIn(<SystemInfo account={account} {...props} />)} />
        <Route path="" render={() => <Result status="404" title="404 NOT FOUND" subTitle={i18next.t("general:Sorry, the page you visited does not exist.")} extra={<a href="/"><Button type="primary">{i18next.t("general:Back Home")}</Button></a>} />} />
      </Switch>
    );
  }

  function isHiddenHeaderAndFooter(pathOrUri) {
    const u = pathOrUri !== undefined ? pathOrUri : uri;
    if (!u) {
      return false;
    }
    const hiddenPaths = ["/workbench", "/access"];
    for (const path of hiddenPaths) {
      if (u.startsWith(path)) {
        return true;
      }
    }
    return false;
  }

  function isWithoutCard() {
    return Setting.isMobile() || isHiddenHeaderAndFooter(uri) || window.location.pathname === "/chat" || window.location.pathname.startsWith("/chat/") || window.location.pathname === "/";
  }

  function renderHeader() {
    if (isHiddenHeaderAndFooter()) {
      return null;
    }

    const onClick = ({key}) => {
      if (Setting.isMobile()) {
        setMenuVisible(false);
      }
      onMenuClick({key});
    };

    return (
      <Header style={{display: "flex", justifyContent: "space-between", alignItems: "center", padding: "0", marginBottom: "4px", backgroundColor: isDark ? "black" : "white", position: "sticky", top: 0, zIndex: 99, boxShadow: "0 1px 4px rgba(0,0,0,0.08)", height: "52px", lineHeight: "52px"}}>
        <div style={{display: "flex", alignItems: "center"}}>
          {Setting.isMobile() ? (
            <React.Fragment>
              <Drawer title={i18next.t("general:Close")} placement="left" open={menuVisible} onClose={onClose}>
                <Menu
                  items={getMenuItems()}
                  mode={"inline"}
                  selectedKeys={[selectedLeafKey]}
                  openKeys={menuOpenKeys}
                  onOpenChange={setMenuOpenKeys}
                  style={{lineHeight: "48px"}}
                  onClick={onClick}
                />
              </Drawer>
              <Button icon={<BarsOutlined />} onClick={showMenu} type="text">
                {i18next.t("general:Menu")}
              </Button>
            </React.Fragment>
          ) : (
            <Button
              icon={siderCollapsed ? <MenuUnfoldOutlined /> : <MenuFoldOutlined />}
              onClick={toggleSider}
              type="text"
              style={{fontSize: 16, width: 40, height: 40}}
            />
          )}
          <BreadcrumbBar uri={currentUri} />
        </div>
        <div style={{flexShrink: 0}}>
          {renderAccountMenu()}
        </div>
      </Header>
    );
  }

  function renderFooter() {
    if (isHiddenHeaderAndFooter()) {
      return null;
    }

    return (
      <React.Fragment>
        <Footer id="footer" style={{textAlign: "center", height: "67px"}}>
          <div dangerouslySetInnerHTML={{__html: Setting.getFooterHtml(themeAlgorithm, store?.footerHtml)}} />
        </Footer>
      </React.Fragment>
    );
  }

  const siderWidth = 256;
  const siderCollapsedWidth = 80;
  const showSider = !Setting.isMobile() && !isHiddenHeaderAndFooter();
  if (window.location.pathname === "/signin") {
    return renderRouter();
  }
  const contentMarginLeft = showSider ? (siderCollapsed ? siderCollapsedWidth : siderWidth) : 0;

  return (
    <React.Fragment>
      {showSider && (
        <Sider
          collapsed={siderCollapsed}
          collapsedWidth={siderCollapsedWidth}
          width={siderWidth}
          trigger={null}
          theme={isDark ? "dark" : "light"}
          style={{
            height: "100vh",
            position: "fixed",
            left: 0,
            top: 0,
            bottom: 0,
            zIndex: 100,
            boxShadow: "2px 0 8px rgba(0,0,0,0.08)",
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{
            height: 52,
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: siderCollapsed ? "center" : "flex-start",
            padding: siderCollapsed ? "0" : "0 16px 0 24px",
            overflow: "hidden",
          }}>
            <Link to="/">
              <img
                src={siderCollapsed ? (store?.avatar || siderLogo) : siderLogo}
                alt="logo"
                style={{
                  height: siderCollapsed ? 28 : 40,
                  width: siderCollapsed ? 28 : undefined,
                  maxWidth: siderCollapsed ? 28 : 160,
                  objectFit: "contain",
                  borderRadius: siderCollapsed ? 4 : 0,
                  transition: "max-width 0.2s, height 0.2s, width 0.2s",
                }}
              />
            </Link>
          </div>
          <div className="sider-menu-container" style={{flex: 1, overflow: "auto"}}>
            <Menu
              mode="inline"
              items={getMenuItems()}
              selectedKeys={[selectedLeafKey]}
              openKeys={menuOpenKeys}
              onOpenChange={setMenuOpenKeys}
              theme={isDark ? "dark" : "light"}
              style={{borderRight: 0}}
              onClick={({key}) => onMenuClick({key})}
            />
          </div>
        </Sider>
      )}
      <div style={{marginLeft: contentMarginLeft, transition: "margin-left 0.2s", display: "flex", flexDirection: "column", minHeight: "100vh"}}>
        {renderHeader()}
        <Content style={{display: "flex", flexDirection: "column"}}>
          {isWithoutCard() ?
            renderRouter() :
            <Card className="content-warp-card" styles={{body: {padding: 0, margin: 0}}}>
              {renderRouter()}
            </Card>
          }
        </Content>
        {renderFooter()}
      </div>
    </React.Fragment>
  );
}

export default withRouter(ManagementPage);
